/// <reference lib="webworker" />
import { Bm25, indexVideo, search, tokenize } from '@mediamind/engine';
import type { Embedder, VideoIndex } from '@mediamind/engine';
import { createMiniLm } from './embedder';
import type { WorkerRequest, WorkerResponse } from './protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: WorkerResponse) => ctx.postMessage(m);

let embedderP: Promise<Embedder | null> | null = null;
function getEmbedder(): Promise<Embedder | null> {
  // Created once per worker; if the model can't load we degrade to keyword search.
  embedderP ??= createMiniLm(`${ctx.location.origin}/models`).catch((e) => {
    console.error('MiniLM failed to load; falling back to keyword search', e);
    return null;
  });
  return embedderP;
}

// Only the most recent video is kept.
let current: { videoId: string; index: VideoIndex; bm25: Bm25 } | null = null;

ctx.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'index') {
      const embedder = await getEmbedder();
      const index = await indexVideo(msg.input, embedder, (stage, fraction) =>
        post({ id: msg.id, type: 'progress', stage, fraction }),
      );
      const bm25 = new Bm25(index.segments.map((s) => tokenize(s.text + ' ' + s.indexText)));
      current = { videoId: index.videoId, index, bm25 };
      post({ id: msg.id, type: 'indexed', index, embedder: embedder ? 'ok' : 'unavailable' });
    } else if (msg.type === 'load') {
      // Hydrate from a cached (IndexedDB) index so Ask works without re-indexing.
      const { index } = msg;
      const bm25 = new Bm25(index.segments.map((s) => tokenize(s.text + ' ' + s.indexText)));
      current = { videoId: index.videoId, index, bm25 };
      post({ id: msg.id, type: 'loaded' });
    } else if (msg.type === 'ask') {
      if (!current || current.videoId !== msg.videoId) throw new Error(`No index for video ${msg.videoId}`);
      const { index, bm25 } = current;
      let qv: Float32Array | null = null;
      if (index.searchMode === 'hybrid') {
        const embedder = await getEmbedder();
        if (embedder) qv = (await embedder.embed([msg.query]))[0];
      }
      const hits = search(
        { segments: index.segments, embeddings: index.embeddings, bm25, mode: qv ? 'hybrid' : 'keyword' },
        msg.query,
        qv,
      );
      post({ id: msg.id, type: 'answer', hits });
    }
  } catch (e) {
    post({ id: msg.id, type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
