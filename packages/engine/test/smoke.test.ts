import { describe, it, expect } from 'vitest';
import type { Cue } from '../src';

describe('engine scaffold', () => {
  it('exports types', () => {
    const c: Cue = { start: 0, dur: 1, text: 'hi' };
    expect(c.text).toBe('hi');
  });
});
