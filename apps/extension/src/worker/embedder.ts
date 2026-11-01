import { env, pipeline } from '@huggingface/transformers';
import type { Embedder } from '@mediamind/engine';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const BATCH = 16;

const inBrowser = () =>
  typeof document !== 'undefined' ||
  (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope);

/** Loads the bundled quantized MiniLM from `modelBase` (a folder path in Node, a URL in the browser). No network. */
export async function createMiniLm(modelBase: string): Promise<Embedder> {
  const base = modelBase.replace(/\/+$/, '');
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = base + '/';
  const browser = inBrowser();
  if (browser) {
    env.useBrowserCache = false; // Cache API put() rejects chrome-extension:// URLs
    const wasm = env.backends.onnx.wasm;
    if (wasm) {
      // CPU-only runtime files bundled by scripts/fetch-model.ts (the JSEP build is too large).
      wasm.wasmPaths = {
        mjs: `${base}/ort/ort-wasm-simd-threaded.mjs`,
        wasm: `${base}/ort/ort-wasm-simd-threaded.wasm`,
      };
      if (!self.crossOriginIsolated) wasm.numThreads = 1;
      wasm.proxy = false;
    }
  }
  const extractor = await pipeline('feature-extraction', MODEL_ID, {
    dtype: 'q8',
    ...(browser ? { device: 'wasm' as const } : {}),
  });
  return {
    async embed(texts: string[]): Promise<Float32Array[]> {
      const out: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += BATCH) {
        const t = await extractor(texts.slice(i, i + BATCH), { pooling: 'mean', normalize: true });
        const [n, d] = t.dims as number[];
        const data = t.data as Float32Array;
        for (let r = 0; r < n; r++) out.push(data.slice(r * d, (r + 1) * d));
        t.dispose?.();
      }
      return out;
    },
  };
}
