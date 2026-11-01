import { describe, it, expect, vi, beforeEach } from 'vitest';

class FakeWorker {
  static last: FakeWorker;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  sent: any[] = [];
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(m: any) {
    this.sent.push(m);
  }
  reply(m: any) {
    this.onmessage?.({ data: m } as MessageEvent);
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('Worker', FakeWorker);
});

const input: any = { videoId: 'v1', duration: 10, lang: 'en', cues: [], creatorChapters: [] };

describe('worker client', () => {
  it('resolves index with progress', async () => {
    const { indexInWorker } = await import('../src/worker/client');
    const prog = vi.fn();
    const p = indexInWorker(input, prog, new AbortController().signal);
    const w = FakeWorker.last;
    w.reply({ id: w.sent[0].id, type: 'progress', stage: 'embedding', fraction: 0.5 });
    w.reply({ id: w.sent[0].id, type: 'indexed', index: { videoId: 'v1' }, embedder: 'ok' });
    await expect(p).resolves.toEqual({ videoId: 'v1', index: { videoId: 'v1' }, embedder: 'ok' });
    expect(prog).toHaveBeenCalledWith('embedding', 0.5);
  });

  it('rejects with AbortError and ignores the late result', async () => {
    const { indexInWorker } = await import('../src/worker/client');
    const ac = new AbortController();
    const p = indexInWorker(input, () => {}, ac.signal);
    const w = FakeWorker.last;
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(() => w.reply({ id: w.sent[0].id, type: 'indexed', index: {} })).not.toThrow();
  });

  it('rejects ask on worker error', async () => {
    const { askInWorker } = await import('../src/worker/client');
    const p = askInWorker('nope', 'q');
    const w = FakeWorker.last;
    w.reply({ id: w.sent[0].id, type: 'error', message: 'No index' });
    await expect(p).rejects.toThrow('No index');
  });
});

describe('worker client load', () => {
  it('sends a load request and resolves on loaded', async () => {
    const { loadInWorker } = await import('../src/worker/client');
    const p = loadInWorker({ videoId: 'v1' } as any);
    const w = FakeWorker.last;
    expect(w.sent[0]).toMatchObject({ type: 'load' });
    w.reply({ id: w.sent[0].id, type: 'loaded' });
    await expect(p).resolves.toBeUndefined();
  });
});
