import { describe, it, expect } from 'vitest';
import { autoChapters, evenChapters, titleChapters, keyPoints } from '../src/chapters';
import type { Segment, Chapter } from '../src/types';

function seg(i: number, len: number, indexText = ''): Segment {
  return { idx: i, start: i * len, end: (i + 1) * len, text: indexText, indexText, lang: 'en', keywords: [] };
}
const segs = (n: number, len: number) => Array.from({ length: n }, (_, i) => seg(i, len));
function oneHot(k: number, dim = 8): Float32Array {
  const v = new Float32Array(dim);
  v[k] = 1;
  return v;
}
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
function contiguous(ch: Chapter[], duration: number) {
  expect(ch[0].start).toBe(0);
  expect(ch[ch.length - 1].end).toBe(duration);
  ch.forEach((c, i) => {
    expect(c.end).toBeGreaterThan(c.start);
    expect(c.idx).toBe(i);
    if (i > 0) expect(c.start).toBe(ch[i - 1].end);
  });
}

describe('chapters', () => {
  it('finds topic boundaries', () => {
    const s = segs(30, 50);
    const emb = s.map((_, i) => oneHot(Math.floor(i / 10)));
    const ch = autoChapters(s, emb, 1500);
    expect(ch.map((c) => c.start)).toEqual([0, 500, 1000]);
    expect(ch.every((c) => c.source === 'auto')).toBe(true);
    contiguous(ch, 1500);
  });
  it('short video yields one chapter', () => {
    const s = segs(3, 30);
    const ch = autoChapters(s, s.map((_, i) => oneHot(i)), 90);
    expect(ch).toHaveLength(1);
    expect([ch[0].start, ch[0].end]).toEqual([0, 90]);
  });
  it('3h video stays within cap', () => {
    const r = rng(7);
    const s = segs(308, 35);
    const emb = s.map(() => Float32Array.from({ length: 16 }, () => r() - 0.5));
    const ch = autoChapters(s, emb, 10800);
    expect(ch.length).toBeGreaterThanOrEqual(12);
    expect(ch.length).toBeLessThanOrEqual(30);
    for (const c of ch) expect(c.end - c.start).toBeGreaterThanOrEqual(120);
    contiguous(ch, 10800);
  });
  it('chapters are contiguous and cover [0,duration]', () => {
    const r = rng(3);
    const s = segs(100, 30);
    const emb = s.map(() => Float32Array.from({ length: 8 }, () => r()));
    contiguous(autoChapters(s, emb, 3000), 3000);
    contiguous(evenChapters(s, 3000), 3000);
  });
  it('evenChapters uses ~600s blocks and absorbs a short remainder', () => {
    const s = segs(120, 30);
    const ch = evenChapters(s, 3600);
    expect(ch.map((c) => c.start)).toEqual([0, 600, 1200, 1800, 2400, 3000]);
    expect(ch.every((c) => c.source === 'even')).toBe(true);
    const ch2 = evenChapters(segs(107, 30), 3220); // remainder 220 < 300 absorbed
    expect(ch2.map((c) => c.start)).toEqual([0, 600, 1200, 1800, 2400]);
    contiguous(ch2, 3220);
  });
  it('titles are top keywords title-cased joined by " · "', () => {
    const a = 'Backpropagation computes gradients. The chain rule links layers. Backpropagation uses the chain rule. Backpropagation again with chain rule.';
    const b = 'Convolution filters scan images. Pooling reduces resolution. Convolution again. Pooling again.';
    const s = [seg(0, 300, a), seg(1, 300, b)];
    const base: Chapter[] = [
      { idx: 0, start: 0, end: 300, title: '', source: 'auto', keywords: [] },
      { idx: 1, start: 300, end: 600, title: '', source: 'even', keywords: [] },
    ];
    const out = titleChapters(base, s);
    expect(base[0].title).toBe('');
    expect(out[0].title).toContain("Backpropagation");
    expect(out[0].title).toContain('Chain Rule');
    for (const c of out) {
      expect(c.title.split(' · ').length).toBeLessThanOrEqual(3);
      expect(c.title.length).toBeLessThanOrEqual(40);
      expect(c.keywords.length).toBeGreaterThan(0);
    }
  });
  it('creator chapters keep their title', () => {
    const s = [seg(0, 300, 'Backpropagation backpropagation chain rule chain rule')];
    const out = titleChapters([{ idx: 0, start: 0, end: 300, title: 'Intro', source: 'creator', keywords: [] }], s);
    expect(out[0].title).toBe('Intro');
    expect(out[0].keywords.length).toBeGreaterThan(0);
  });
  it('keyPoints returns n segments inside the chapter in time order', () => {
    const s = segs(10, 30);
    const emb = s.map((_, i) => (i < 6 ? oneHot(0) : oneHot(1)));
    emb[2] = Float32Array.from([0.5, 0.5, 0, 0, 0, 0, 0, 0]);
    const chapter: Chapter = { idx: 0, start: 0, end: 180, title: '', source: 'auto', keywords: [] };
    const kp = keyPoints(chapter, s, emb);
    expect(kp).toHaveLength(3);
    expect(kp.every((x) => x.start >= 0 && x.end <= 180)).toBe(true);
    expect(kp.map((x) => x.start)).toEqual([...kp.map((x) => x.start)].sort((a, b) => a - b));
    expect(kp.map((x) => x.idx)).not.toContain(2);
    expect(keyPoints(chapter, s, emb, 5)).toHaveLength(5);
  });
});
