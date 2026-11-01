// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { createMiniLm } from '../src/worker/embedder';

const cos = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i], 0);

describe('bundled MiniLM embedder', () => {
  it('produces 384-d unit vectors with sensible similarity', async () => {
    const embedder = await createMiniLm(resolve(__dirname, '../public/models'));
    const v = await embedder.embed([
      'backpropagation is the chain rule',
      'how gradients flow backwards',
      'my favourite pizza',
    ]);
    expect(v).toHaveLength(3);
    for (const x of v) {
      expect(x).toHaveLength(384);
      const norm = Math.sqrt(x.reduce((s, y) => s + y * y, 0));
      expect(Math.abs(norm - 1)).toBeLessThan(1e-3);
    }
    expect(cos(v[0], v[1])).toBeGreaterThan(cos(v[0], v[2]) + 0.2);
  }, 60_000);
});
