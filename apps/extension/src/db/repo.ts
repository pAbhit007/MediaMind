import type { VideoIndex } from '@mediamind/engine';
import { db, type Note, type VideoMeta } from './schema';
import { currentStreak, localDate } from './streak';

export type VideoMetaInput = Pick<VideoMeta, 'id' | 'title' | 'channel' | 'duration' | 'lang'>;

export async function saveIndex(meta: VideoMetaInput, index: VideoIndex, captionTrackKey: string): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.videos, db.segments, db.chapters, async () => {
    const prev = await db.videos.get(meta.id);
    await db.segments.where('videoId').equals(meta.id).delete();
    await db.chapters.where('videoId').equals(meta.id).delete();
    await db.segments.bulkPut(
      index.segments.map((s, i) => ({ ...s, videoId: meta.id, embedding: index.embeddings[i] ?? new Float32Array(0) })),
    );
    await db.chapters.bulkPut(index.chapters.map((c) => ({ ...c, videoId: meta.id })));
    await db.videos.put({
      ...meta,
      captionTrackKey,
      indexedAt: now,
      lastOpenedAt: now,
      watchedRanges: prev?.watchedRanges ?? [],
      searchMode: index.searchMode,
      suggestions: index.suggestions,
    });
  });
}

export async function loadIndex(videoId: string, captionTrackKey: string): Promise<VideoIndex | null> {
  const v = await db.videos.get(videoId);
  if (!v || v.captionTrackKey !== captionTrackKey) return null;
  const [segs, chapters] = await Promise.all([
    db.segments.where('videoId').equals(videoId).sortBy('idx'),
    db.chapters.where('videoId').equals(videoId).sortBy('idx'),
  ]);
  if (!segs.length) return null;
  await db.videos.update(videoId, { lastOpenedAt: Date.now() });
  return {
    videoId,
    lang: v.lang,
    duration: v.duration,
    segments: segs.map(({ videoId: _v, embedding: _e, ...s }) => s),
    embeddings: segs.map((s) => (s.embedding instanceof Float32Array ? s.embedding : new Float32Array(s.embedding))),
    chapters: chapters.map(({ videoId: _v, ...c }) => c),
    searchMode: v.searchMode ?? 'keyword',
    suggestions: v.suggestions ?? [],
  };
}

export const getVideo = (id: string) => db.videos.get(id);

export async function recentVideos(n: number): Promise<VideoMeta[]> {
  return db.videos.orderBy('lastOpenedAt').reverse().limit(n).toArray();
}

export type NewNote = Pick<Note, 'videoId' | 't' | 'text' | 'kind'> & { id?: string; quote?: string };
export async function addNote(n: NewNote): Promise<Note> {
  const now = Date.now();
  const note: Note = { ...n, id: n.id ?? crypto.randomUUID(), createdAt: now, updatedAt: now };
  await db.notes.add(note);
  return note;
}
export async function updateNote(id: string, patch: Partial<Pick<Note, 'text' | 'quote' | 't'>>): Promise<void> {
  await db.notes.update(id, { ...patch, updatedAt: Date.now() });
}
export async function deleteNote(id: string): Promise<void> {
  await db.notes.delete(id);
}
/** Put a deleted note back exactly as it was (undo). */
export async function restoreNote(n: Note): Promise<void> {
  await db.notes.put(n);
}
export async function listNotes(videoId: string): Promise<Note[]> {
  const rows = await db.notes.where('videoId').equals(videoId).toArray();
  return rows.sort((a, b) => a.t - b.t || a.createdAt - b.createdAt);
}

export function mergeRanges(ranges: [number, number][]): [number, number][] {
  const sorted = ranges.map((r) => [...r] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push(r);
  }
  return out;
}

export async function addWatchedRange(videoId: string, range: [number, number]): Promise<void> {
  await db.transaction('rw', db.videos, async () => {
    const v = await db.videos.get(videoId);
    if (!v) return; // not indexed yet: nothing to attach to
    await db.videos.update(videoId, { watchedRanges: mergeRanges([...v.watchedRanges, range]) });
  });
}

const listeners = new Set<() => void>();
export function onActivity(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function logActivity(kind: 'ask' | 'note' | 'highlight', date: string = localDate()): Promise<void> {
  await db.transaction('rw', db.activity, async () => {
    const row = (await db.activity.get(date)) ?? { date, ask: 0, note: 0, highlight: 0 };
    row[kind] += 1;
    await db.activity.put(row);
  });
  listeners.forEach((f) => f());
}

export async function activeDates(): Promise<string[]> {
  const rows = await db.activity.toArray();
  return rows.filter((r) => r.ask + r.note + r.highlight > 0).map((r) => r.date).sort();
}

export async function currentStreakToday(): Promise<number> {
  return currentStreak(await activeDates(), localDate());
}
