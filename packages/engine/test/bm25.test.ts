import { describe, it, expect } from 'vitest';
import { Bm25 } from '../src/bm25';

describe('Bm25', () => {
  const docs = [['cat', 'sat'], ['dog', 'barked', 'loud'], ['cat', 'cat', 'cat', 'dog']];
  const bm = new Bm25(docs);
  it('scores matching docs higher than non-matching', () => {
    const s = bm.score(['barked']);
    expect(s[1]).toBeGreaterThan(0);
    expect(s[0]).toBe(0);
    expect(s[2]).toBe(0);
  });
  it('rarer terms weigh more', () => {
    expect(bm.score(['barked'])[1]).toBeGreaterThan(bm.score(['dog'])[1]);
  });
  it('unknown query gives zeros', () => {
    expect(Array.from(bm.score(['zzz']))).toEqual([0, 0, 0]);
  });
  it('handles empty corpus', () => {
    expect(new Bm25([]).score(['a']).length).toBe(0);
  });
});
