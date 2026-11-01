import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseJson3 } from '../src/captions';
import { segmentCues, SEGMENT_MIN, SEGMENT_MAX } from '../src/segment';
import type { Cue } from '../src/types';

const load = (n: string) =>
  parseJson3(JSON.parse(readFileSync(new URL(`./fixtures/${n}.json3.json`, import.meta.url), 'utf8')));

describe('segmentCues', () => {
  it('segments are 25–40s and break on cue boundaries', () => {
    const cues = load('lecture-en');
    const segs = segmentCues(cues, 'en');
    const starts = new Set(cues.map((c) => c.start));
    expect(SEGMENT_MIN).toBe(25);
    expect(SEGMENT_MAX).toBe(40);
    segs.forEach((s, i) => {
      expect(s.idx).toBe(i);
      expect(starts.has(s.start)).toBe(true);
      if (i < segs.length - 1) {
        expect(s.end - s.start).toBeGreaterThanOrEqual(25);
        expect(s.end - s.start).toBeLessThanOrEqual(40);
        expect(segs[i + 1].start).toBeCloseTo(s.end);
      }
    });
    expect(segs[0].start).toBe(cues[0].start);
    const joined = segs.map((s) => s.text).join(' ');
    expect(joined).toBe(cues.map((c) => c.text).join(' '));
  });

  it('prefers breaking after sentence punctuation within the window', () => {
    const cues: Cue[] = [];
    for (let i = 0; i < 20; i++) cues.push({ start: i * 5, dur: 5, text: i === 6 ? `w${i}.` : `w${i}` });
    const segs = segmentCues(cues, 'en');
    expect(segs[0].end).toBe(35);
    expect(segs[0].text.endsWith('w6.')).toBe(true);
  });

  it('english track: indexText === text', () => {
    for (const s of segmentCues(load('lecture-en'), 'en')) expect(s.indexText).toBe(s.text);
  });

  it('aligns translation by time', () => {
    const hi = load('hindi');
    const en = load('hindi-tlang-en');
    const segs = segmentCues(hi, 'hi', en);
    const mid = (c: Cue) => c.start + c.dur / 2;
    const used = new Set<number>();
    segs.forEach((s, i) => {
      expect(s.lang).toBe('hi');
      const last = i === segs.length - 1;
      const picked = en
        .map((c, j) => ({ c, j }))
        .filter(({ c }) => mid(c) >= s.start && (last || mid(c) < s.end));
      picked.forEach(({ j }) => {
        expect(used.has(j)).toBe(false);
        used.add(j);
      });
      expect(s.indexText).toBe(picked.map(({ c }) => c.text).join(' '));
    });
    expect(used.size).toBeGreaterThan(0);
  });

  it('single cue longer than 40s becomes its own segment', () => {
    const cues: Cue[] = [
      { start: 0, dur: 5, text: 'a' },
      { start: 5, dur: 60, text: 'long' },
      { start: 65, dur: 5, text: 'b' },
    ];
    const segs = segmentCues(cues, 'en');
    expect(segs.map((s) => s.text)).toEqual(['a', 'long', 'b']);
    expect(segs[1].start).toBe(5);
    expect(segs[1].end).toBe(65);
  });

  it('handles zero-duration cues and empty input', () => {
    expect(segmentCues([], 'en')).toEqual([]);
    const cues: Cue[] = Array.from({ length: 30 }, (_, i) => ({ start: i * 4, dur: 0, text: `c${i}` }));
    const segs = segmentCues(cues, 'en');
    expect(segs[0].end).toBeLessThanOrEqual(40);
    expect(segs[0].end - segs[0].start).toBeGreaterThanOrEqual(25);
  });

  it('falls back to text when translation is empty or has a gap', () => {
    const cues: Cue[] = Array.from({ length: 40 }, (_, i) => ({ start: i * 5, dur: 5, text: `h${i}` }));
    for (const s of segmentCues(cues, 'hi', [])) expect(s.indexText).toBe(s.text);
    const tr: Cue[] = [
      { start: 100, dur: 5, text: 'e20' },
      { start: 150, dur: 5, text: 'e30' },
    ];
    const segs = segmentCues(cues, 'hi', [...tr].reverse());
    expect(segs[0].indexText).toBe(segs[0].text);
    expect(segs.every((s) => s.indexText.length > 0)).toBe(true);
    expect(segs.some((s) => s.indexText === 'e20')).toBe(true);
  });
});
