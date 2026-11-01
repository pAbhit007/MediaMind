import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/text';

describe('tokenize', () => {
  it('drops stopwords and keeps devanagari', () => {
    const t = tokenize('The chain rules are applied, नमस्ते');
    expect(t).toContain('chain');
    expect(t).toContain('rule');
    expect(t).toContain('नमस्ते');
    expect(t).not.toContain('the');
    expect(t).not.toContain('are');
    expect(t).toHaveLength(4);
  });
  it('is stable across word forms of query and document', () => {
    expect(tokenize('applied')).toEqual(tokenize('applied'));
    expect(tokenize('Rules')).toEqual(tokenize('rule'));
    expect(tokenize('descending')).toEqual(tokenize('descended'));
  });
  it('keeps search-relevant words that are generic for keywords', () => {
    const m = tokenize('merge sort');
    expect(m).toContain('merge');
    expect(m).toContain('sort');
    expect(tokenize('mean squared error')).toHaveLength(3);
    expect(tokenize('sort')).toEqual(['sort']);
  });
});
