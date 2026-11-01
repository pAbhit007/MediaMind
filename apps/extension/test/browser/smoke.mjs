// Real-Chromium smoke test of the built extension: indexes a tiny English video through the worker.
// Run: npm run build -w apps/extension && npm run test:browser -w apps/extension
import { chromium } from 'playwright-core';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ext = resolve(dirname(fileURLToPath(import.meta.url)), '../../.output/chrome-mv3');
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'mm-')), {
  headless: false,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--headless=new'],
});
let assets = [];
try {
  assets = readdirSync(join(ext, 'assets'));
} catch {
  throw new Error('build output missing; run `npm run build -w apps/extension` first');
}
const workerFile = assets.find((f) => /^index\.worker-.*\.js$/.test(f));
if (!workerFile) throw new Error('built worker chunk not found; run the build first');
let failed = false;
try {
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;
  const page = await ctx.newPage();
  const bad = [];
  // Context-level listeners also see dedicated-worker console output and requests.
  ctx.on('console', (m) => m.type() === 'error' && bad.push(m.text()));
  ctx.on('request', (r) => {
    if (!/^(chrome-extension|data|blob):/.test(r.url())) bad.push('NETWORK ' + r.url());
  });
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  const cues = Array.from({ length: 12 }, (_, i) => ({
    start: i * 10,
    dur: 10,
    text:
      i < 6
        ? 'backpropagation uses the chain rule so gradients flow backwards through the network layers'
        : 'my favourite pizza has cheese tomato and basil baked in a wood fired oven',
  }));
  // Drive the built worker chunk directly over its message protocol (no production test hooks).
  const res = await page.evaluate(
    async ({ cues, url }) => {
      const w = new Worker(chrome.runtime.getURL(url), { type: 'module' });
      const call = (msg) =>
        new Promise((resolve, reject) => {
          const onMsg = (ev) => {
            if (ev.data.id !== msg.id || ev.data.type === 'progress') return;
            w.removeEventListener('message', onMsg);
            ev.data.type === 'error' ? reject(new Error(ev.data.message)) : resolve(ev.data);
          };
          w.addEventListener('message', onMsg);
          w.addEventListener('error', (e) => reject(new Error(e.message)), { once: true });
          w.postMessage(msg);
        });
      const h = await call({
        id: 1,
        type: 'index',
        input: { videoId: 'smoke', duration: 120, lang: 'en', cues, creatorChapters: [] },
      });
      const a = await call({ id: 2, type: 'ask', videoId: 'smoke', query: 'how do gradients flow backwards' });
      w.terminate();
      const e = h.index.embeddings;
      return {
        embedder: h.embedder,
        mode: h.index.searchMode,
        dims: e.map((v) => v.length),
        norms: e.map((v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0))),
        top: a.hits[0]?.start ?? null,
      };
    },
    { cues, url: `assets/${workerFile}` },
  );
  console.log(JSON.stringify(res), bad.length ? bad : '');
  const ok =
    res.embedder === 'ok' &&
    res.mode === 'hybrid' &&
    res.dims.length > 0 &&
    res.dims.every((d) => d === 384) &&
    res.norms.every((n) => Math.abs(n - 1) < 1e-3) &&
    bad.length === 0;
  if (!ok) failed = true;
} catch (e) {
  console.error(e);
  failed = true;
} finally {
  await ctx.close();
}
console.log(failed ? 'BROWSER SMOKE FAILED' : 'BROWSER SMOKE OK');
process.exit(failed ? 1 : 0);
