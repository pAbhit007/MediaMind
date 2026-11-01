import type { Hit, Segment, SearchMode } from './types';
import type { Bm25 } from './bm25';
import { tokenize, tokenizeChunks } from './text';

export const MIN_SCORE = 0.35;
const KEYWORD_MIN = 0.2;
const W_COS = 0.65;
const W_BM25 = 0.35;

export type SearchInput = {
  segments: Segment[];
  embeddings: Float32Array[];
  bm25: Bm25;
  mode: SearchMode;
};

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function search(
  input: SearchInput,
  query: string,
  queryVec: Float32Array | null,
  k = 3,
): Hit[] {
  const { segments, embeddings, bm25, mode } = input;
  const qtoks = tokenizeChunks(query).flat().filter((t) => t !== null);
  if (!qtoks.length || !segments.length) return [];

  const raw = bm25.score(qtoks.map((t) => t.stem));
  let max = 0;
  for (const v of raw) if (v > max) max = v;
  const keyword = mode === 'keyword' || !queryVec;

  const cands: { i: number; score: number; matched: string[] }[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const bn = max > 0 ? raw[i] / max : 0;
    const stems = new Set(tokenize(seg.text + ' ' + seg.indexText));
    const seen = new Set<string>();
    const matched: string[] = [];
    for (const t of qtoks) {
      if (stems.has(t.stem) && !seen.has(t.surface)) {
        seen.add(t.surface);
        matched.push(t.surface);
      }
    }
    let score: number;
    if (keyword) {
      if (bn < KEYWORD_MIN || !matched.length) continue;
      score = bn;
    } else {
      const cos = Math.max(0, embeddings[i] ? dot(queryVec!, embeddings[i]) : 0);
      score = W_COS * cos + W_BM25 * bn;
      if (score < MIN_SCORE) continue;
    }
    cands.push({ i, score, matched });
  }

  cands.sort((a, b) => b.score - a.score || a.i - b.i);
  const picked: typeof cands = [];
  for (const c of cands) {
    if (picked.length >= k) break;
    if (picked.some((p) => Math.abs(p.i - c.i) <= 1)) continue;
    picked.push(c);
  }
  return picked.map((c) => {
    const s = segments[c.i];
    return {
      segmentIdx: s.idx,
      start: s.start,
      end: s.end,
      text: s.text,
      score: c.score,
      matchedTerms: c.matched,
    };
  });
}
