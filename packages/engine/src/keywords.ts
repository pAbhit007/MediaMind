import { tokenizeChunks, isGenericWord, type Tok } from './text';

type Doc = { tf: Map<string, number>; surf: Map<string, Map<string, number>> };

function analyze(text: string): Doc {
  const tf = new Map<string, number>();
  const surf = new Map<string, Map<string, number>>();
  const add = (key: string, surface: string) => {
    tf.set(key, (tf.get(key) ?? 0) + 1);
    let m = surf.get(key);
    if (!m) surf.set(key, (m = new Map()));
    m.set(surface, (m.get(surface) ?? 0) + 1);
  };
  for (const chunk of tokenizeChunks(text)) {
    let prev: Tok | null = null;
    for (const t0 of chunk) {
      const t = t0 && isGenericWord(t0.surface) ? null : t0;
      if (t && t.surface.length >= 3 && !/^\d+$/.test(t.surface)) add(t.stem, t.surface);
      if (t && prev) add(prev.stem + ' ' + t.stem, prev.surface + ' ' + t.surface);
      prev = t;
    }
  }
  return { tf, surf };
}

const BIGRAM_BOOST = 1.5;

function rank(scores: Map<string, number>, surfaces: (key: string) => string, k: number): string[] {
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const picked: string[] = []; // stem keys
  for (const [key] of sorted) {
    if (picked.length >= k) break;
    if (!key.includes(' ')) {
      // skip a unigram already covered by a chosen bigram
      if (picked.some((p) => p.includes(' ') && p.split(' ').includes(key))) continue;
    }
    picked.push(key);
  }
  return picked.map(surfaces);
}

function bestSurface(docs: Doc[], key: string): string {
  const agg = new Map<string, number>();
  for (const d of docs) for (const [s, c] of d.surf.get(key) ?? []) agg.set(s, (agg.get(s) ?? 0) + c);
  return [...agg.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
}

function idfMap(docs: Doc[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const d of docs) for (const k of d.tf.keys()) df.set(k, (df.get(k) ?? 0) + 1);
  const n = docs.length;
  const idf = new Map<string, number>();
  for (const [k, c] of df) idf.set(k, Math.log(1 + n / c));
  return idf;
}

const boost = (k: string) => (k.includes(' ') ? BIGRAM_BOOST : 1);

export function extractKeywords(docs: string[], topK = 5): string[][] {
  const an = docs.map(analyze);
  const idf = idfMap(an);
  return an.map((d) => {
    const scores = new Map<string, number>();
    for (const [k, c] of d.tf) {
      // a bigram seen once is noise
      if (k.includes(' ') && c < 2) continue;
      scores.set(k, c * (idf.get(k) ?? 0) * boost(k));
    }
    return rank(scores, (k) => bestSurface([d], k), topK);
  });
}

export function topKeywords(docs: string[], k: number): string[] {
  const an = docs.map(analyze);
  const idf = idfMap(an);
  const total = new Map<string, number>();
  for (const d of an) for (const [key, c] of d.tf) total.set(key, (total.get(key) ?? 0) + c);
  const scores = new Map<string, number>();
  for (const [key, c] of total) {
    if (key.includes(' ') && c < 2) continue;
    scores.set(key, c * (idf.get(key) ?? 0) * boost(key));
  }
  return rank(scores, (key) => bestSurface(an, key), k);
}

export function suggestQuestions(keywords: string[]): string[] {
  const pad = 'What is this video about?';
  const q = [
    keywords[0] ? `What is ${keywords[0]}?` : pad,
    keywords[1] ? `What is ${keywords[1]}?` : pad,
    keywords[2] ? `Why ${keywords[2]}?` : pad,
  ];
  return q;
}
