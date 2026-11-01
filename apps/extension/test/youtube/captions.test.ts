import { describe, it, expect, vi, afterEach } from 'vitest';
import { getCaptions, ensureNonce } from '../../src/youtube/captions';
import { MM_SOURCE, type MainPayload } from '../../src/youtube/bridge';

const meta = { videoId: 'abc', title: 'T', channel: 'C', duration: 100, description: '0:00 A\n0:30 B\n1:00 C', lang: 'en' };
let stopFake: (() => void) | null = null;

function fakeMainWorld(payload: MainPayload | null, delayMs = 0) {
  const nonce = ensureNonce();
  const onMsg = (e: MessageEvent) => {
    const d = e.data;
    if (d?.source !== MM_SOURCE || d.type !== 'mm:get-captions' || d.nonce !== nonce || !payload) return;
    const reply = () =>
      window.postMessage({ source: MM_SOURCE, type: 'mm:captions-result', nonce, id: d.id, result: payload }, '*');
    if (delayMs) setTimeout(reply, delayMs);
    else reply();
  };
  window.addEventListener('message', onMsg);
  stopFake = () => window.removeEventListener('message', onMsg);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  stopFake?.();
  stopFake = null;
});

describe('getCaptions (content script side)', () => {
  it('returns timedtext cues from the main world', async () => {
    const cues = [{ start: 0, dur: 1, text: 'hi' }];
    fakeMainWorld({ kind: 'ok', meta, lang: 'en', cues, creatorChapters: [] });
    const dom = vi.fn();
    const res = await getCaptions('abc', 'en', { timeoutMs: 500, readDom: dom });
    expect(res).toMatchObject({ kind: 'ok', via: 'timedtext', cues, title: 'T', channel: 'C', duration: 100, lang: 'en' });
    expect(dom).not.toHaveBeenCalled();
  });

  it('reports no-captions without trying the DOM', async () => {
    fakeMainWorld({ kind: 'no-captions', meta });
    const dom = vi.fn();
    const res = await getCaptions('abc', 'en', { timeoutMs: 500, readDom: dom });
    expect(res).toEqual({ kind: 'none', videoId: 'abc', title: 'T', reason: 'no-captions' });
    expect(dom).not.toHaveBeenCalled();
  });

  it('falls back to the DOM on main-world failure, with description chapters', async () => {
    fakeMainWorld({ kind: 'failed', meta, error: 'no capture' });
    const cues = [{ start: 0, dur: 2, text: 'from dom' }];
    const res = await getCaptions('abc', 'en', { timeoutMs: 500, readDom: async () => cues });
    expect(res).toMatchObject({ kind: 'ok', via: 'dom', cues, lang: 'en' });
    expect(res.kind === 'ok' && res.creatorChapters.map((c) => c.title)).toEqual(['A', 'B', 'C']);
  });

  it('falls back to the DOM on timeout', async () => {
    fakeMainWorld(null);
    const cues = [{ start: 0, dur: 2, text: 'from dom' }];
    const res = await getCaptions('abc', 'en', { timeoutMs: 30, readDom: async () => cues });
    expect(res).toMatchObject({ kind: 'ok', via: 'dom', cues });
  });

  it('never throws: DOM failure -> none/failed', async () => {
    fakeMainWorld(null);
    const res = await getCaptions('abc', 'en', {
      timeoutMs: 30,
      readDom: async () => {
        throw new Error('boom');
      },
    });
    expect(res).toMatchObject({ kind: 'none', videoId: 'abc', reason: 'failed' });
  });

  it('waits up to 20 s by default: a reply after 9 s is still ok', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const cues = [{ start: 0, dur: 1, text: 'slow' }];
    fakeMainWorld({ kind: 'ok', meta, lang: 'hi', cues, creatorChapters: [] }, 9000);
    const dom = vi.fn(async () => []);
    const p = getCaptions('abc', 'en', { readDom: dom });
    await vi.advanceTimersByTimeAsync(9100);
    expect(await p).toMatchObject({ kind: 'ok', via: 'timedtext', cues });
    expect(dom).not.toHaveBeenCalled();
  });

  it('failed path carries the main-world error as detail and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fakeMainWorld({ kind: 'failed', meta, error: 'no timedtext captured' });
    const res = await getCaptions('abc', 'en', { timeoutMs: 500, readDom: async () => [] });
    expect(res).toEqual({ kind: 'none', videoId: 'abc', title: 'T', reason: 'failed', detail: 'no timedtext captured' });
    expect(warn).toHaveBeenCalledWith('MediaMind: captions', 'failed', 'no timedtext captured');
  });

  it('timeout path says so in detail', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fakeMainWorld(null);
    const res = await getCaptions('abc', 'en', { timeoutMs: 30, readDom: async () => [] });
    expect(res).toMatchObject({ kind: 'none', reason: 'failed', detail: expect.stringMatching(/timed out/) });
  });
});

describe('getCaptions DOM fallback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('cannot hang: a DOM reader that never settles is cut off', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fakeMainWorld({ kind: 'failed', meta, error: 'no timedtext captured' });
    const res = await getCaptions('abc', 'en', { timeoutMs: 200, domTimeoutMs: 50, readDom: () => new Promise(() => {}) });
    expect(res).toMatchObject({ kind: 'none', reason: 'failed', detail: 'no timedtext captured' });
  });
});
