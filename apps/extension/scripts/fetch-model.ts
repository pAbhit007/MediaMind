// Build-time only: downloads the MiniLM files and copies onnxruntime-web wasm into public/models.
// Nothing here runs in the shipped extension. Idempotent: existing files are skipped.
import { existsSync, mkdirSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modelDir = resolve(root, 'public/models/Xenova/all-MiniLM-L6-v2');
const ortDir = resolve(root, 'public/models/ort');
const REPO = 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main';
const FILES = ['onnx/model_quantized.onnx', 'tokenizer.json', 'tokenizer_config.json', 'config.json'];
// Non-JSEP (CPU-only) runtime: ~11 MB instead of ~21 MB; keeps the package under 40 MB.
const ORT_FILES = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'];

async function main() {
  for (const f of FILES) {
    const dest = resolve(modelDir, f);
    if (existsSync(dest)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    console.log(`fetch ${f}`);
    const res = await fetch(`${REPO}/${f}`);
    if (!res.ok) throw new Error(`download failed ${f}: ${res.status}`);
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  }
  const require = createRequire(import.meta.url);
  // package.json isn't exported; resolve the entry (…/onnxruntime-web/dist/x.js) and use its dir.
  const ortDist = dirname(require.resolve('onnxruntime-web'));
  mkdirSync(ortDir, { recursive: true });
  for (const f of ORT_FILES) {
    const dest = resolve(ortDir, f);
    if (!existsSync(dest)) {
      console.log(`copy ${f}`);
      copyFileSync(resolve(ortDist, f), dest);
    }
  }
}

function verify() {
  const expected = [
    ...FILES.map((f) => resolve(modelDir, f)),
    ...ORT_FILES.map((f) => resolve(ortDir, f)),
  ];
  for (const p of expected) {
    if (!existsSync(p) || statSync(p).size === 0) throw new Error(`missing or empty: ${p}`);
  }
}

main().then(verify).catch((e) => {
  console.error(e);
  process.exit(1);
});
