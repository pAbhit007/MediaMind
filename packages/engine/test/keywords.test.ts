import { describe, it, expect } from 'vitest';
import { extractKeywords, topKeywords, suggestQuestions } from '../src/keywords';

describe('keywords', () => {
  it('bigrams beat their unigrams when frequent', () => {
    const docs = [
      'We use gradient descent. Gradient descent updates weights. Gradient descent is simple. ' +
        'Gradient descent again. Gradient descent converges. Gradient descent rocks.',
      'Matrices multiply. Vectors add.',
    ];
    const k = extractKeywords(docs, 5)[0];
    expect(k).toContain('gradient descent');
    const g = k.indexOf('gradient');
    expect(g === -1 || k.indexOf('gradient descent') < g).toBe(true);
  });
  it('excludes filler', () => {
    const docs = ['Um like you know actually okay right uh gonna backpropagation backpropagation'];
    const all = [...extractKeywords(docs, 20).flat(), ...topKeywords(docs, 20)];
    for (const w of ['like', 'know', 'gonna', 'actually', 'um', 'uh', 'okay', 'right']) {
      expect(all).not.toContain(w);
    }
    expect(all).toContain('backpropagation');
  });
  it('excludes generic words from keywords', () => {
    const docs = ['sort sort sort mean mean look look thing thing way way kind kind lot lot bit bit go go one one two two see see well well backpropagation backpropagation'];
    const all = [...extractKeywords(docs, 30).flat(), ...topKeywords(docs, 30)];
    for (const w of ['sort', 'mean', 'look', 'see', 'kind', 'well', 'lot', 'bit', 'way', 'thing', 'one', 'two', 'go']) {
      expect(all).not.toContain(w);
    }
    expect(all).toContain('backpropagation');
  });
  it('returns surface forms, not stems', () => {
    const k = topKeywords(['Neural networks learn. Neural networks generalize.'], 3);
    expect(k).toContain('neural networks');
  });
  it('suggestQuestions', () => {
    expect(suggestQuestions(['backpropagation', 'loss function', 'relu'])).toEqual([
      'What is backpropagation?', 'What is loss function?', 'Why relu?',
    ]);
    expect(suggestQuestions(['a'])).toEqual([
      'What is a?', 'What is this video about?', 'What is this video about?',
    ]);
    expect(suggestQuestions([])).toHaveLength(3);
  });
});
