import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { indexVideo } from '../src/pipeline';
import { parseJson3 } from '../src/captions';
import type { Embedder, Chapter } from '../src/types';

const fx = (n: string) => parseJson3(JSON.parse(readFileSync(new URL(`./fixtures/${n}.json3.json`, import.meta.url), 'utf8')));

function fakeEmbedder() {
  const calls: number[] = [];
  const e: Embedder = {
    async embed(texts) {
      calls.push(texts.length);
      return texts.map((t) => {
        const v = new Float32Array(8);
        v[t.length % 8] = 1;
        return v;
      });
    },
  };
  return { e, calls };
}
const en = fx('lecture-en');
const hi = fx('hindi');
const hiEn = fx('hindi-tlang-en');
const dur = (c: { start: number; dur: number }[]) => Math.ceil(c[c.length - 1].start + c[c.length - 1].dur);

describe('indexVideo', () => {
  it('hybrid for english', async () => {
    const { e, calls } = fakeEmbedder();
    const idx = await indexVideo({ videoId: 'v', duration: dur(en), lang: 'en', cues: en, creatorChapters: [] }, e);
    expect(idx.searchMode).toBe('hybrid');
    expect(idx.embeddings.length).toBe(idx.segments.length);
    expect(idx.segments.length).toBeGreaterThan(0);
    expect(calls.every((n) => n <= 32)).toBe(true);
    expect(idx.segments.some((s) => s.keywords.length > 0)).toBe(true);
    expect(idx.chapters[0].source).toBe('auto');
    expect(idx.suggestions).toHaveLength(3);
  });
  it('hybrid for hindi with translation', async () => {
    const { e } = fakeEmbedder();
    const idx = await indexVideo({ videoId: 'v', duration: dur(hi), lang: 'hi', cues: hi, translatedCues: hiEn, creatorChapters: [] }, e);
    expect(idx.searchMode).toBe('hybrid');
    expect(idx.embeddings.length).toBe(idx.segments.length);
  });
  it('keyword mode for hindi without translation', async () => {
    const { e, calls } = fakeEmbedder();
    const idx = await indexVideo({ videoId: 'v', duration: dur(hi), lang: 'hi', cues: hi, creatorChapters: [] }, e);
    expect(idx.searchMode).toBe('keyword');
    expect(idx.embeddings).toEqual([]);
    expect(calls).toEqual([]);
    expect(idx.chapters.every((c) => c.source === 'even')).toBe(true);
  });
  it('keyword mode without embedder', async () => {
    const idx = await indexVideo({ videoId: 'v', duration: dur(en), lang: 'en', cues: en, creatorChapters: [] }, null);
    expect(idx.searchMode).toBe('keyword');
    expect(idx.embeddings).toEqual([]);
  });
  it('creator chapters win', async () => {
    const { e } = fakeEmbedder();
    const d = dur(en);
    const creator: Chapter[] = [
      { idx: 0, start: 0, end: 100, title: 'Intro', source: 'creator', keywords: [] },
      { idx: 1, start: 100, end: d, title: 'Main', source: 'creator', keywords: [] },
    ];
    const idx = await indexVideo({ videoId: 'v', duration: d, lang: 'en', cues: en, creatorChapters: creator }, e);
    expect(idx.chapters.map((c) => c.title)).toEqual(['Intro', 'Main']);
    expect(idx.chapters.every((c) => c.source === 'creator')).toBe(true);
    expect(idx.chapters.some((c) => c.keywords.length > 0)).toBe(true);
  });
  it('progress reaches done with fraction 1', async () => {
    const { e } = fakeEmbedder();
    const ev: [string, number][] = [];
    await indexVideo({ videoId: 'v', duration: dur(en), lang: 'en', cues: en, creatorChapters: [] }, e, (s, f) => ev.push([s, f]));
    expect(ev[0][0]).toBe('segmenting');
    expect(ev[ev.length - 1]).toEqual(['done', 1]);
    const order = ['segmenting', 'embedding', 'chapters', 'done'];
    const ranks = ev.map(([s]) => order.indexOf(s));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(new Set(ev.map(([s]) => s))).toEqual(new Set(order));
    const emb = ev.filter(([s]) => s === 'embedding').map(([, f]) => f);
    expect(emb[emb.length - 1]).toBe(1);
  });
  it('zero cues gives empty index', async () => {
    const { e } = fakeEmbedder();
    const idx = await indexVideo({ videoId: 'v', duration: 600, lang: 'en', cues: [], creatorChapters: [] }, e);
    expect(idx.segments).toEqual([]);
    expect(idx.embeddings).toEqual([]);
    expect(idx.chapters).toHaveLength(1);
    expect([idx.chapters[0].start, idx.chapters[0].end, idx.chapters[0].title]).toEqual([0, 600, '']);
    expect(idx.suggestions).toHaveLength(3);
  });
});
