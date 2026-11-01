import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

function listAll(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? listAll(p) : [p];
  });
}

function dirSize(dir: string): number {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    total += s.isDirectory() ? dirSize(p) : s.size;
  }
  return total;
}

describe('built package size', () => {
  it('is at most 40 MB and contains the model + wasm', () => {
    const out = resolve(__dirname, '../.output/chrome-mv3');
    expect(dirSize(out)).toBeLessThanOrEqual(40 * 1024 * 1024);
    expect(existsSync(join(out, 'models/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx'))).toBe(true);
    expect(existsSync(join(out, 'models/ort/ort-wasm-simd-threaded.wasm'))).toBe(true);
  });
  it('bundles the worker and no unused JSEP wasm', () => {
    const files = listAll(resolve(__dirname, '../.output/chrome-mv3'));
    expect(files.filter((f) => /jsep.*\.wasm$/.test(f))).toEqual([]);
    expect(files.some((f) => /index\.worker-.*\.js$/.test(f))).toBe(true);
  });
});
