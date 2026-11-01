import { describe, it, expect } from 'vitest';
import { Bm25 } from '../src/bm25';
import { search, MIN_SCORE } from '../src/search';
import { tokenize } from '../src/text';
import type { Segment } from '../src/types';

const texts = [
  'photosynthesis converts sunlight into chemical energy',
  'the mitochondria is the powerhouse of the cell',
  'plants use chlorophyll to absorb sunlight',
  'tax law changed in the budget',
  'chlorophyll sits inside the chloroplast',
  'cooking pasta requires boiling water',
];
const topic = [0, 1, 0, 2, 0, 3];
const segs: Segment[] = texts.map((t, i) => ({
  idx: i, start: i * 30, end: i * 30 + 30, text: t, indexText: t, lang: 'en', keywords: [],
}));
const vec = (k: number) => { const v = new Float32Array(4); v[k] = 1; return v; };
const emb = topic.map(vec);
const bm25 = new Bm25(segs.map((s) => tokenize(s.text + ' ' + s.indexText)));
const base = { segments: segs, embeddings: emb, bm25 };

describe('search', () => {
  it('hybrid merges cosine and bm25', () => {
    const q = 'chlorophyll sunlight';
    const hits = search({ ...base, mode: 'hybrid' }, q, vec(0), 6);
    const raw = bm25.score(tokenize(q));
    const max = Math.max(...raw);
    const exp = (i: number) => 0.65 * (topic[i] === 0 ? 1 : 0) + 0.35 * (raw[i] / max);
    const h2 = hits.find((h) => h.segmentIdx === 2)!;
    expect(h2.score).toBeCloseTo(exp(2), 6);
    expect(hits[0].segmentIdx).toBe(2);
  });
  it('returns top 3 non-overlapping', () => {
    const hits = search({ ...base, mode: 'hybrid' }, 'chlorophyll sunlight', vec(0));
    expect(hits.length).toBeLessThanOrEqual(3);
    for (let i = 0; i < hits.length; i++)
      for (let j = i + 1; j < hits.length; j++)
        expect(Math.abs(hits[i].segmentIdx - hits[j].segmentIdx)).toBeGreaterThan(1);
    expect(hits.map((h) => h.segmentIdx)).toEqual(expect.arrayContaining([2, 0]));
    expect(hits.map((h) => h.segmentIdx)).not.toContain(1); // neighbour of 0 and 2
  });
  it('returns empty below min score', () => {
    const inp = { ...base, mode: 'hybrid' as const };
    expect(search(inp, 'the and of', vec(3))).toEqual([]);
    expect(search(inp, 'quantum gravity', vec(1).map(() => 0))).toEqual([]);
    expect(search(inp, '', vec(0))).toEqual([]);
    expect(MIN_SCORE).toBe(0.35);
  });
  it('keyword mode ignores vectors', () => {
    const hits = search({ ...base, mode: 'keyword' }, 'pasta boiling', null);
    expect(hits[0].segmentIdx).toBe(5);
    expect(hits[0].score).toBeCloseTo(1, 6);
    expect(search({ ...base, mode: 'keyword' }, 'zzz', null)).toEqual([]);
  });
  it('matchedTerms lists query tokens present in the segment text', () => {
    const hits = search({ ...base, mode: 'keyword' }, 'Chlorophyll sunlight pasta', null);
    const h = hits.find((x) => x.segmentIdx === 2)!;
    expect(h.matchedTerms.sort()).toEqual(['chlorophyll', 'sunlight']);
    expect(h.text).toBe(texts[2]);
  });
});
