import type { Cue, CaptionTrack, Chapter } from './types';

const NAMED: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

function decodeEntities(s: string): string {
  return s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (m, hex, dec, name) => {
    if (hex || dec) {
      const cp = hex ? parseInt(hex, 16) : parseInt(dec, 10);
      try {
        return String.fromCodePoint(cp);
      } catch {
        return m;
      }
    }
    return NAMED[String(name).toLowerCase()] ?? m;
  });
}

/** Decode entities, strip single-word [tags]/(tags) and ">>", collapse whitespace. */
export function cleanCueText(s: string): string {
  let t = decodeEntities(s);
  t = t.replace(/\[[^\s\[\]]+\]|\([^\s()]+\)/g, ' ');
  t = t.replace(/>>/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

type Json3Event = { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] };

export function parseJson3(raw: unknown): Cue[] {
  const events = (raw as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return [];
  const sorted = (events as Json3Event[])
    .filter((e) => e && Array.isArray(e.segs) && typeof e.tStartMs === 'number')
    .sort((a, b) => (a.tStartMs as number) - (b.tStartMs as number));
  const out: Cue[] = [];
  let prevLines: string[] = []; // cleaned lines of the previous non-empty event
  for (const e of sorted) {
    const lines = (e.segs as { utf8?: string }[])
      .map((s) => s?.utf8 ?? '')
      .join('')
      .split('\n')
      .map(cleanCueText)
      .filter(Boolean);
    if (!lines.length) continue;
    const start = (e.tStartMs as number) / 1000;
    const dur = Math.max(0, (e.dDurationMs ?? 0) / 1000);
    // Rolling captions: drop leading lines that repeat the tail of the previous event.
    let k = Math.min(lines.length, prevLines.length);
    while (k > 0 && !lines.slice(0, k).every((l, i) => l === prevLines[prevLines.length - k + i])) k--;
    const fresh = lines.slice(k);
    prevLines = lines;
    const prev = out[out.length - 1];
    let text = fresh.join(' ');
    // Same-line growth ("hello there" -> "hello there how are you"): keep only the suffix.
    if (prev && text.startsWith(prev.text + ' ')) text = text.slice(prev.text.length + 1);
    if (!text || (prev && text === prev.text)) {
      if (prev) prev.dur = Math.max(prev.dur, start + dur - prev.start);
      continue;
    }
    if (prev && prev.start + prev.dur > start) prev.dur = Math.max(0, start - prev.start);
    out.push({ start, dur, text });
  }
  return out;
}

const base = (l: string) => l.toLowerCase().split(/[-_]/)[0];

/**
 * Preference: manual in UI lang, manual en, any manual (YouTube lists the
 * default track first), then the same order for auto-generated (asr).
 */
export function pickTrack(tracks: CaptionTrack[], uiLang: string): CaptionTrack | null {
  const ui = base(uiLang);
  for (const kind of ['manual', 'asr'] as const) {
    const of = tracks.filter((t) => t.kind === kind);
    const hit = of.find((t) => base(t.languageCode) === ui) ?? of.find((t) => base(t.languageCode) === 'en') ?? of[0];
    if (hit) return hit;
  }
  return null;
}

const LINE = /^[\s\-–—•*·▪►]*\(?\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\]?[\s\-–—:|.]*(.*)$/;

function toSeconds(ts: string): number {
  return ts.split(':').reduce((acc, p) => acc * 60 + parseInt(p, 10), 0);
}

/** YouTube's own rule: >= 3 timestamps, first at 0:00, ascending. */
export function parseDescriptionChapters(description: string, duration: number): Chapter[] {
  const found: { start: number; title: string }[] = [];
  for (const line of description.split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (!m) continue;
    const start = toSeconds(m[1]);
    const title = m[2].trim();
    if (found.length && start <= found[found.length - 1].start) continue;
    found.push({ start, title: title || `Chapter ${found.length + 1}` });
  }
  if (found.length < 3 || found[0].start !== 0) return [];
  const valid = found.filter((f) => f.start < duration);
  if (valid.length < 3) return [];
  return valid.map((f, i) => ({
    idx: i,
    start: f.start,
    end: i + 1 < valid.length ? valid[i + 1].start : duration,
    title: f.title,
    source: 'creator' as const,
    keywords: [],
  }));
}
