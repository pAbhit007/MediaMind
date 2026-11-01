import 'fake-indexeddb/auto';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { VideoIndex } from '@mediamind/engine';

const client = vi.hoisted(() => ({
  indexInWorker: vi.fn(),
  loadInWorker: vi.fn(async () => {}),
  askInWorker: vi.fn(async () => []),
}));
vi.mock('../src/worker/client', () => client);

import { db } from '../src/db/schema';
import * as repo from '../src/db/repo';
import { useVideoSession } from '../src/session/useVideoSession';

type Listener<T> = { addListener(f: T): void };
class FakePort {
  static all: FakePort[] = [];
  sent: any[] = [];
  msgs: ((m: any) => void)[] = [];
  discs: (() => void)[] = [];
  onMessage: Listener<(m: any) => void> = { addListener: (f) => void this.msgs.push(f) };
  onDisconnect: Listener<() => void> = { addListener: (f) => void this.discs.push(f) };
  constructor(public name: string) {
    FakePort.all.push(this);
  }
  postMessage(m: any) {
    this.sent.push(m);
  }
  disconnect() {
    this.discs.forEach((f) => f());
  }
  emit(m: any) {
    this.msgs.forEach((f) => f(m));
  }
}
const port = () => FakePort.all[FakePort.all.length - 1];

const mkIndex = (videoId: string): VideoIndex => ({
  videoId,
  lang: 'en',
  duration: 100,
  segments: [{ idx: 0, start: 0, end: 30, text: 'a', indexText: 'a', lang: 'en', keywords: [] }],
  embeddings: [new Float32Array([1, 0])],
  chapters: [],
  searchMode: 'keyword',
  suggestions: [],
});
const okCaptions = (videoId: string, extra: object = {}) => ({
  t: 'captions',
  result: {
    kind: 'ok', videoId, title: `T-${videoId}`, channel: 'C', duration: 100, lang: 'en',
    cues: [], creatorChapters: [], via: 'timedtext', ...extra,
  },
});

beforeEach(async () => {
  FakePort.all = [];
  client.indexInWorker.mockReset();
  client.loadInWorker.mockClear();
  (globalThis as any).chrome = { runtime: { connect: (o: { name: string }) => new FakePort(o.name) } };
  await db.delete();
  await db.open();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useVideoSession', () => {
  it('starts as no-video and connects mm-panel', async () => {
    const { result } = renderHook(() => useVideoSession());
    expect(port().name).toBe('mm-panel');
    expect(result.current.state.s).toBe('no-video');
  });

  it('ignores stale index results after navigation', async () => {
    let resolveA!: (v: any) => void;
    let signalA!: AbortSignal;
    client.indexInWorker.mockImplementationOnce((_in: any, _p: any, signal: AbortSignal) => {
      signalA = signal;
      return new Promise((r) => (resolveA = r));
    });
    client.indexInWorker.mockImplementationOnce(() => new Promise(() => {})); // B never finishes
    const { result } = renderHook(() => useVideoSession());
    act(() => port().emit({ t: 'video', videoId: 'A', title: 'A' }));
    act(() => port().emit(okCaptions('A')));
    await waitFor(() => expect(client.indexInWorker).toHaveBeenCalledTimes(1));
    act(() => port().emit({ t: 'video', videoId: 'B', title: 'B' }));
    expect(signalA.aborted).toBe(true);
    await act(async () => {
      resolveA({ videoId: 'A', index: mkIndex('A'), embedder: 'ok' });
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(result.current.state).toMatchObject({ s: 'loading', videoId: 'B' });
    expect(await db.videos.get('A')).toBeUndefined();
  });

  it('ignores captions for a video that is not current', async () => {
    const { result } = renderHook(() => useVideoSession());
    act(() => port().emit({ t: 'video', videoId: 'B' }));
    act(() => port().emit(okCaptions('A')));
    await new Promise((r) => setTimeout(r, 20));
    expect(client.indexInWorker).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({ s: 'loading', videoId: 'B' });
  });

  it('indexes, saves, and becomes ready; time ticks keep the index object', async () => {
    client.indexInWorker.mockImplementation(async (inp: any, onP: any) => {
      onP('embedding', 0.5);
      return { videoId: inp.videoId, index: mkIndex(inp.videoId), embedder: 'ok' };
    });
    const { result } = renderHook(() => useVideoSession());
    act(() => port().emit({ t: 'video', videoId: 'A', title: 'A' }));
    expect(port().sent).toContainEqual({ t: 'getCaptions' });
    act(() => port().emit(okCaptions('A')));
    await waitFor(() => expect(result.current.state.s).toBe('ready'));
    const st1: any = result.current.state;
    expect(st1.meta.title).toBe('T-A');
    expect(await repo.loadIndex('A', 'en|timedtext|')).not.toBeNull();
    act(() => port().emit({ t: 'time', time: 12, playing: true }));
    const st2: any = result.current.state;
    expect(st2.time).toBe(12);
    expect(st2.playing).toBe(true);
    expect(st2.index).toBe(st1.index);
    act(() => result.current.seek(40));
    expect(port().sent).toContainEqual({ t: 'seek', time: 40, play: true });
    act(() => result.current.pause());
    expect(port().sent).toContainEqual({ t: 'pause' });
  });

  it('uses cached index without re-indexing', async () => {
    await repo.saveIndex({ id: 'A', title: 'Cached', channel: 'C', duration: 100, lang: 'en' }, mkIndex('A'), 'en|timedtext|');
    const { result } = renderHook(() => useVideoSession());
    act(() => port().emit({ t: 'video', videoId: 'A' }));
    act(() => port().emit(okCaptions('A')));
    await waitFor(() => expect(result.current.state.s).toBe('ready'));
    expect(client.indexInWorker).not.toHaveBeenCalled();
    expect(client.loadInWorker).toHaveBeenCalledTimes(1);
  });

  it('re-indexes when the caption track key differs', async () => {
    await repo.saveIndex({ id: 'A', title: 'x', channel: 'C', duration: 100, lang: 'en' }, mkIndex('A'), 'en|timedtext|');
    client.indexInWorker.mockResolvedValue({ videoId: 'A', index: mkIndex('A'), embedder: 'ok' });
    const { result } = renderHook(() => useVideoSession());
    act(() => port().emit({ t: 'video', videoId: 'A' }));
    act(() => port().emit(okCaptions('A', { via: 'dom' })));
    await waitFor(() => expect(result.current.state.s).toBe('ready'));
    expect(client.indexInWorker).toHaveBeenCalledTimes(1);
  });

  it('reports no-captions', async () => {
    const { result } = renderHook(() => useVideoSession());
    act(() => port().emit({ t: 'video', videoId: 'A' }));
    act(() => port().emit({ t: 'captions', result: { kind: 'none', videoId: 'A', title: 'TA', reason: 'no-captions' } }));
    expect(result.current.state).toEqual({ s: 'no-captions', videoId: 'A', title: 'TA' });
  });

  it('reconnects after disconnect with backoff and re-requests state', async () => {
    vi.useFakeTimers();
    renderHook(() => useVideoSession());
    const first = port();
    act(() => first.disconnect());
    expect(FakePort.all).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(FakePort.all.length).toBe(2);
    expect(port().name).toBe('mm-panel');
  });

  it('ask delegates to the worker and logs activity', async () => {
    client.indexInWorker.mockResolvedValue({ videoId: 'A', index: mkIndex('A'), embedder: 'ok' });
    (client.askInWorker as any).mockResolvedValue([{ segmentIdx: 0 }]);
    const { result } = renderHook(() => useVideoSession());
    act(() => port().emit({ t: 'video', videoId: 'A' }));
    act(() => port().emit(okCaptions('A')));
    await waitFor(() => expect(result.current.state.s).toBe('ready'));
    let hits: any;
    await act(async () => {
      hits = await result.current.ask('q');
    });
    expect(client.askInWorker).toHaveBeenCalledWith('A', 'q');
    expect(hits).toHaveLength(1);
    expect((await repo.activeDates()).length).toBe(1);
  });

  it('reason failed -> caption-error with detail; retry() asks again', async () => {
    const { result } = renderHook(() => useVideoSession());
    act(() => port().emit({ t: 'video', videoId: 'A' }));
    const before = port().sent.filter((m) => m.t === 'getCaptions').length;
    act(() =>
      port().emit({ t: 'captions', result: { kind: 'none', videoId: 'A', title: 'TA', reason: 'failed', detail: 'no timedtext captured' } }),
    );
    expect(result.current.state).toEqual({ s: 'caption-error', videoId: 'A', title: 'TA', detail: 'no timedtext captured' });
    act(() => result.current.retry());
    expect(port().sent.filter((m) => m.t === 'getCaptions').length).toBe(before + 1);
    expect(result.current.state).toMatchObject({ s: 'loading', videoId: 'A', stage: 'captions' });
  });

  it('indexing throw -> caption-error (not no-captions), logged with the stage', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    client.indexInWorker.mockImplementation(async (_inp: any, onP: any) => {
      onP('embedding', 0.1);
      throw new Error('worker blew up');
    });
    const { result } = renderHook(() => useVideoSession());
    act(() => port().emit({ t: 'video', videoId: 'A' }));
    act(() => port().emit(okCaptions('A')));
    await waitFor(() => expect(result.current.state.s).toBe('caption-error'));
    expect(result.current.state).toMatchObject({ videoId: 'A', title: 'T-A' });
    expect(err).toHaveBeenCalledWith('MediaMind: indexing failed', 'embedding', expect.any(Error));
    err.mockRestore();
  });

  it('retry() gives up after 25 s without a reply -> caption-error "no reply"', async () => {
    const { result } = renderHook(() => useVideoSession());
    act(() => port().emit({ t: 'video', videoId: 'A' }));
    act(() => port().emit({ t: 'captions', result: { kind: 'none', videoId: 'A', title: 'TA', reason: 'failed' } }));
    vi.useFakeTimers();
    act(() => result.current.retry());
    expect(result.current.state).toMatchObject({ s: 'loading', videoId: 'A' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(24000);
    });
    expect(result.current.state).toMatchObject({ s: 'loading', videoId: 'A' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.state).toMatchObject({ s: 'caption-error', videoId: 'A', detail: 'no reply' });
  });

  it('retry() timer is cancelled by a reply', async () => {
    const { result } = renderHook(() => useVideoSession());
    act(() => port().emit({ t: 'video', videoId: 'A' }));
    act(() => port().emit({ t: 'captions', result: { kind: 'none', videoId: 'A', title: 'TA', reason: 'failed' } }));
    vi.useFakeTimers();
    act(() => result.current.retry());
    act(() => port().emit({ t: 'captions', result: { kind: 'none', videoId: 'A', title: 'TA', reason: 'no-captions' } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(26000);
    });
    expect(result.current.state).toEqual({ s: 'no-captions', videoId: 'A', title: 'TA' });
  });
});
