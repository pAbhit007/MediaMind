import type { Chapter, ChapterSource, Segment } from './types';
import { extractKeywords } from './keywords';

const MIN_CHAPTER = 120;
const EVEN_BLOCK = 600;
const EVEN_MIN_TAIL = 300;
const WINDOW = 3;

function build(starts: number[], duration: number, source: ChapterSource): Chapter[] {
  return starts.map((start, idx) => ({
    idx,
    start,
    end: idx + 1 < starts.length ? starts[idx + 1] : duration,
    title: '',
    source,
    keywords: [],
  }));
}

function meanVec(vs: Float32Array[]): Float32Array {
  const m = new Float32Array(vs[0].length);
  for (const v of vs) for (let i = 0; i < m.length; i++) m[i] += v[i];
  for (let i = 0; i < m.length; i++) m[i] /= vs.length;
  return m;
}

function cosine(a: Float32Array, b: Float32Array): number {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

export function autoChapters(segments: Segment[], embeddings: Float32Array[], duration: number): Chapter[] {
  const n = segments.length;
  const hours = duration / 3600;
  const cap = Math.max(1, Math.floor(hours * 10));
  let target = Math.min(Math.max(Math.round(hours * 7), 1), cap);
  if (duration >= 1800) target = Math.max(target, Math.ceil(hours * 4));
  target = Math.min(target, cap);
  if (duration < 2 * MIN_CHAPTER || n < 2 || target <= 1) return build([0], duration, 'auto');

  const cands: { b: number; depth: number }[] = [];
  for (let b = 1; b < n; b++) {
    const before = embeddings.slice(Math.max(0, b - WINDOW), b);
    const after = embeddings.slice(b, Math.min(n, b + WINDOW));
    cands.push({ b, depth: 1 - cosine(meanVec(before), meanVec(after)) });
  }
  cands.sort((x, y) => y.depth - x.depth || x.b - y.b);

  const chosen: number[] = []; // start times, sorted
  for (const { b } of cands) {
    if (chosen.length >= target - 1) break;
    const t = segments[b].start;
    if (t < MIN_CHAPTER || duration - t < MIN_CHAPTER) continue;
    if (chosen.some((c) => Math.abs(c - t) < MIN_CHAPTER)) continue;
    chosen.push(t);
    chosen.sort((p, q) => p - q);
  }
  return build([0, ...chosen], duration, 'auto');
}

export function evenChapters(segments: Segment[], duration: number): Chapter[] {
  const starts = [0];
  for (let k = 1; k * EVEN_BLOCK < duration; k++) {
    const target = k * EVEN_BLOCK;
    let best = target;
    let bestD = Infinity;
    for (const s of segments) {
      const d = Math.abs(s.start - target);
      if (d < bestD) { bestD = d; best = s.start; }
    }
    const last = starts[starts.length - 1];
    if (best > last && best < duration) starts.push(best);
  }
  // last block absorbs a remainder shorter than EVEN_MIN_TAIL
  while (starts.length > 1 && duration - starts[starts.length - 1] < EVEN_MIN_TAIL) starts.pop();
  return build(starts, duration, 'even');
}

const titleCase = (s: string) => s.replace(/(^|\s)(\S)/g, (_, sp, c) => sp + c.toUpperCase());

function makeTitle(keywords: string[]): string {
  const parts = keywords.slice(0, 3).map(titleCase);
  while (parts.length > 1 && parts.join(' · ').length > 40) parts.pop();
  const t = parts.join(' · ');
  return t.length > 40 ? t.slice(0, 39) + '…' : t;
}

export function titleChapters(chapters: Chapter[], segments: Segment[]): Chapter[] {
  const docs = chapters.map((c) =>
    segments.filter((s) => s.start >= c.start && s.start < c.end).map((s) => s.indexText).join(' '),
  );
  const kws = extractKeywords(docs, 5);
  return chapters.map((c, i) => ({
    ...c,
    keywords: kws[i],
    title: c.source === 'creator' || !kws[i].length ? c.title : makeTitle(kws[i]),
  }));
}

export function keyPoints(chapter: Chapter, segments: Segment[], embeddings: Float32Array[], n = 3): Segment[] {
  const ids: number[] = [];
  segments.forEach((s, i) => {
    if (s.start >= chapter.start && s.start < chapter.end) ids.push(i);
  });
  if (!ids.length) return [];
  const centroid = meanVec(ids.map((i) => embeddings[i]));
  return ids
    .map((i) => ({ i, score: cosine(embeddings[i], centroid) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, n)
    .sort((a, b) => a.i - b.i)
    .map((x) => segments[x.i]);
}
