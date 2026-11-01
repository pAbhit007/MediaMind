import 'fake-indexeddb/auto';
import { beforeEach, describe, it, expect } from 'vitest';
import type { VideoIndex } from '@mediamind/engine';
import { db } from '../../src/db/schema';
import * as repo from '../../src/db/repo';

const index = (videoId = 'v1'): VideoIndex => ({
  videoId,
  lang: 'en',
  duration: 100,
  segments: [
    { idx: 0, start: 0, end: 30, text: 'a', indexText: 'a', lang: 'en', keywords: ['a'] },
    { idx: 1, start: 30, end: 60, text: 'b', indexText: 'b', lang: 'en', keywords: ['b'] },
  ],
  embeddings: [new Float32Array([0.5, 0.25, -1]), new Float32Array([1, 0, 0])],
  chapters: [{ idx: 0, start: 0, end: 60, title: 'T', source: 'auto', keywords: [] }],
  searchMode: 'hybrid',
  suggestions: ['q'],
});
const meta = (id = 'v1') => ({ id, title: 'Title', channel: 'Ch', duration: 100, lang: 'en' });

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('repo', () => {
  it('embeddings round-trip as Float32Array', async () => {
    await repo.saveIndex(meta(), index(), 'en|timedtext|');
    const got = await repo.loadIndex('v1', 'en|timedtext|');
    expect(got).not.toBeNull();
    expect(got!.embeddings[0]).toBeInstanceOf(Float32Array);
    expect(Array.from(got!.embeddings[0])).toEqual([0.5, 0.25, -1]);
    expect(got!.segments.map((s) => s.idx)).toEqual([0, 1]);
    expect(got!.chapters).toHaveLength(1);
    expect(got!.suggestions).toEqual(['q']);
    expect(got!.searchMode).toBe('hybrid');
  });

  it('loadIndex returns null when caption track changed, notes survive', async () => {
    await repo.saveIndex(meta(), index(), 'en|timedtext|');
    await repo.addNote({ id: 'n1', videoId: 'v1', t: 5, text: 'hi', kind: 'note' });
    expect(await repo.loadIndex('v1', 'en|dom|')).toBeNull();
    expect((await repo.listNotes('v1')).map((n) => n.id)).toEqual(['n1']);
    await repo.saveIndex(meta(), index(), 'en|dom|');
    expect(await repo.loadIndex('v1', 'en|dom|')).not.toBeNull();
    expect(await db.segments.count()).toBe(2);
    expect((await repo.listNotes('v1')).length).toBe(1);
  });

  it('recentVideos orders by lastOpenedAt and loadIndex touches it', async () => {
    await repo.saveIndex(meta('a'), index('a'), 'k');
    await new Promise((r) => setTimeout(r, 5));
    await repo.saveIndex(meta('b'), index('b'), 'k');
    expect((await repo.recentVideos(5)).map((v) => v.id)).toEqual(['b', 'a']);
    await new Promise((r) => setTimeout(r, 5));
    await repo.loadIndex('a', 'k');
    expect((await repo.recentVideos(1)).map((v) => v.id)).toEqual(['a']);
  });

  it('notes CRUD', async () => {
    const n = await repo.addNote({ id: 'n1', videoId: 'v1', t: 5, text: 'hi', kind: 'note' });
    expect(n.createdAt).toBeGreaterThan(0);
    await repo.updateNote('n1', { text: 'yo' });
    expect((await repo.listNotes('v1'))[0].text).toBe('yo');
    await repo.deleteNote('n1');
    expect(await repo.listNotes('v1')).toEqual([]);
  });

  it('addWatchedRange merges overlapping ranges and survives re-index', async () => {
    await repo.saveIndex(meta(), index(), 'k');
    await repo.addWatchedRange('v1', [0, 10]);
    await repo.addWatchedRange('v1', [8, 20]);
    await repo.addWatchedRange('v1', [40, 50]);
    await repo.saveIndex(meta(), index(), 'k2');
    expect((await db.videos.get('v1'))!.watchedRanges).toEqual([[0, 20], [40, 50]]);
  });

  it('logActivity / activeDates', async () => {
    await repo.logActivity('ask', '2026-10-30');
    await repo.logActivity('ask', '2026-10-30');
    await repo.logActivity('note', '2026-10-31');
    expect((await db.activity.get('2026-10-30'))!.ask).toBe(2);
    expect(await repo.activeDates()).toEqual(['2026-10-30', '2026-10-31']);
  });
});
