import type { Hit, IndexInput, IndexStage, VideoIndex } from '@mediamind/engine';
import workerUrl from './index.worker.ts?worker&url';
import type { WorkerRequest, WorkerResponse } from './protocol';

export type IndexHandle = { videoId: string; index: VideoIndex; embedder: 'ok' | 'unavailable' };

type Pending = {
  resolve: (r: WorkerResponse) => void;
  reject: (e: unknown) => void;
  onProgress?: (s: IndexStage, f: number) => void;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(workerUrl, { type: 'module' });
  w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
    const m = ev.data;
    const p = pending.get(m.id); // aborted requests are no longer pending: late results are ignored
    if (!p) return;
    if (m.type === 'progress') return p.onProgress?.(m.stage, m.fraction);
    pending.delete(m.id);
    if (m.type === 'error') p.reject(new Error(m.message));
    else p.resolve(m);
  };
  w.onerror = (ev) => {
    for (const p of pending.values()) p.reject(new Error(ev.message || 'worker error'));
    pending.clear();
    worker = null;
  };
  worker = w;
  return w;
}

function abortError(): Error {
  return new DOMException('Indexing aborted', 'AbortError');
}

function request(
  build: (id: number) => WorkerRequest,
  onProgress?: (s: IndexStage, f: number) => void,
  signal?: AbortSignal,
): Promise<WorkerResponse> {
  if (signal?.aborted) return Promise.reject(abortError());
  const id = nextId++;
  return new Promise<WorkerResponse>((resolve, reject) => {
    const onAbort = () => {
      pending.delete(id);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const done = () => signal?.removeEventListener('abort', onAbort);
    pending.set(id, {
      resolve: (r) => (done(), resolve(r)),
      reject: (e) => (done(), reject(e)),
      onProgress,
    });
    getWorker().postMessage(build(id));
  });
}

export async function indexInWorker(
  input: IndexInput,
  onProgress: (s: IndexStage, f: number) => void,
  signal: AbortSignal,
): Promise<IndexHandle> {
  const r = await request((id) => ({ id, type: 'index', input }), onProgress, signal);
  if (r.type !== 'indexed') throw new Error('Unexpected worker response');
  return { videoId: r.index.videoId, index: r.index, embedder: r.embedder };
}

export async function askInWorker(videoId: string, query: string): Promise<Hit[]> {
  const r = await request((id) => ({ id, type: 'ask', videoId, query }));
  if (r.type !== 'answer') throw new Error('Unexpected worker response');
  return r.hits;
}

/** Give the worker a previously stored index so askInWorker works without re-indexing. */
export async function loadInWorker(index: VideoIndex): Promise<void> {
  const r = await request((id) => ({ id, type: 'load', index }));
  if (r.type !== 'loaded') throw new Error('Unexpected worker response');
}
