import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRouter } from '../../src/background/router';
import { setWatchedSink } from '../../src/background/watched';

function fakePort() {
  const msgs: unknown[] = [];
  const l = { msg: [] as ((m: unknown) => void)[], disc: [] as (() => void)[] };
  return {
    name: 'mm-panel',
    msgs,
    postMessage: (m: unknown) => msgs.push(m),
    onMessage: { addListener: (f: (m: unknown) => void) => l.msg.push(f) },
    onDisconnect: { addListener: (f: () => void) => l.disc.push(f) },
    send: (m: unknown) => l.msg.forEach((f) => f(m)),
    disconnect: () => l.disc.forEach((f) => f()),
  };
}

function setup() {
  const sent: { tabId: number; msg: any }[] = [];
  const calls: string[] = [];
  const dead = new Set<number>();
  const api = {
    sidePanel: { open: vi.fn(async () => { calls.push('open'); }) },
    tabs: {
      query: vi.fn(async () => [{ id: 1, windowId: 10 }]),
      sendMessage: vi.fn(async (tabId: number, msg: any) => {
        if (dead.has(tabId)) throw new Error('no receiver');
        calls.push('send:' + msg.t);
        sent.push({ tabId, msg });
        return msg.t === 'pauseGetTime' ? { time: 42 } : undefined;
      }),
    },
  };
  return { api, sent, calls, dead, router: createRouter(api as any, { bufferMs: 5000 }) };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('router', () => {
  beforeEach(() => vi.useRealTimers());

  it('relays panel messages to the active tab and page messages to the panel', async () => {
    const { router, sent } = setup();
    const port = fakePort();
    await router.onPanelConnect(port as any);
    expect(sent.some((s) => s.tabId === 1 && s.msg.t === 'panel' && s.msg.connected)).toBe(true);
    port.send({ t: 'seek', time: 5 });
    await flush();
    expect(sent.at(-1)).toEqual({ tabId: 1, msg: { t: 'seek', time: 5 } });
    router.onRuntimeMessage({ t: 'time', time: 3, playing: true }, { tab: { id: 1 } } as any);
    router.onRuntimeMessage({ t: 'time', time: 9, playing: true }, { tab: { id: 2 } } as any);
    expect(port.msgs).toEqual([{ t: 'time', time: 3, playing: true }]);
    port.disconnect();
    await flush();
    expect(sent.at(-1)!.msg).toEqual({ t: 'panel', connected: false });
  });

  it('forwards watched ranges to the sink', () => {
    const { router } = setup();
    const sink = vi.fn();
    setWatchedSink(sink);
    router.onRuntimeMessage({ t: 'watched', videoId: 'v', range: [1, 2] }, { tab: { id: 1 } } as any);
    expect(sink).toHaveBeenCalledWith('v', [1, 2]);
  });

  it('follows tab activation', async () => {
    const { router, sent } = setup();
    await router.onPanelConnect(fakePort() as any);
    await router.onTabActivated({ tabId: 7 });
    expect(sent.some((s) => s.tabId === 1 && s.msg.t === 'panel' && !s.msg.connected)).toBe(true);
    expect(sent.some((s) => s.tabId === 7 && s.msg.t === 'panel' && s.msg.connected)).toBe(true);
    expect(sent.some((s) => s.tabId === 7 && s.msg.t === 'getState')).toBe(true);
  });

  it('Alt+N opens the panel synchronously before any await, then pauses and delivers newNote', async () => {
    const { router, api, calls } = setup();
    router.onCommand('new-note', { id: 3 } as any);
    expect(api.sidePanel.open).toHaveBeenCalledTimes(1); // synchronous
    expect(calls[0]).toBe('open');
    await flush();
    expect(calls).toContain('send:pauseGetTime');
    // panel not yet connected: buffered, delivered on connect
    const port = fakePort();
    await router.onPanelConnect(port as any);
    expect(port.msgs).toContainEqual({ t: 'newNote', time: 42 });
  });

  it('delivers newNote immediately when the panel is already connected; ignores other commands', async () => {
    const { router, api } = setup();
    const port = fakePort();
    await router.onPanelConnect(port as any);
    router.onCommand('other', { id: 1 } as any);
    expect(api.sidePanel.open).not.toHaveBeenCalled();
    router.onCommand('new-note', { id: 1 } as any);
    await flush();
    expect(port.msgs).toContainEqual({ t: 'newNote', time: 42 });
  });

  it('drops a stale buffered newNote', async () => {
    vi.useFakeTimers();
    const { router } = setup();
    router.onCommand('new-note', { id: 3 } as any);
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(6000);
    const port = fakePort();
    await router.onPanelConnect(port as any);
    expect(port.msgs.some((m: any) => m.t === 'newNote')).toBe(false);
  });

  it('clears the panel video when the followed tab has no content script', async () => {
    const { router, dead } = setup();
    dead.add(1);
    const port = fakePort();
    await router.onPanelConnect(port as any);
    expect(port.msgs).toContainEqual({ t: 'video', videoId: null });
  });

  it('clears the panel video when the followed tab is removed or navigates off YouTube', async () => {
    const { router } = setup();
    const port = fakePort();
    await router.onPanelConnect(port as any);
    port.msgs.length = 0;
    await router.onTabUpdated(1, { url: 'https://example.com/' }, { url: 'https://example.com/' });
    expect(port.msgs).toEqual([{ t: 'video', videoId: null }]);
    port.msgs.length = 0;
    await router.onTabUpdated(99, { url: 'https://example.com/' }, {});
    expect(port.msgs).toEqual([]);
    router.onTabRemoved(1);
    expect(port.msgs).toEqual([{ t: 'video', videoId: null }]);
  });

  it('ignores activations from other windows and re-queries on every connect', async () => {
    const { router, sent, api } = setup();
    const p1 = fakePort();
    await router.onPanelConnect(p1 as any);
    await router.onTabActivated({ tabId: 7, windowId: 99 });
    expect(sent.some((s) => s.tabId === 7)).toBe(false);
    p1.disconnect();
    (api.tabs.query as any).mockResolvedValueOnce([{ id: 5, windowId: 10 }]);
    await router.onPanelConnect(fakePort() as any);
    expect(sent.some((s) => s.tabId === 5 && s.msg.t === 'panel' && s.msg.connected)).toBe(true);
  });

  it('re-attaches on Alt+N from a different tab', async () => {
    const { router, sent } = setup();
    await router.onPanelConnect(fakePort() as any);
    router.onCommand('new-note', { id: 8, windowId: 10 } as any);
    await flush();
    expect(sent.some((s) => s.tabId === 8 && s.msg.t === 'panel' && s.msg.connected)).toBe(true);
    expect(sent.some((s) => s.tabId === 8 && s.msg.t === 'getState')).toBe(true);
  });

  it('re-attaches a reloaded content script (hello, tab complete)', async () => {
    const { router, sent } = setup();
    await router.onPanelConnect(fakePort() as any);
    sent.length = 0;
    router.onRuntimeMessage({ t: 'hello' }, { tab: { id: 1 } } as any);
    await flush();
    expect(sent.some((s) => s.msg.t === 'panel' && s.msg.connected)).toBe(true);
    sent.length = 0;
    await router.onTabUpdated(1, { status: 'complete' }, { url: 'https://www.youtube.com/watch?v=a' });
    expect(sent.some((s) => s.msg.t === 'panel' && s.msg.connected)).toBe(true);
  });
});
