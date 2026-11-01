import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseJson3 } from '@mediamind/engine';
import { installHooks, collectCaptions, startMainWorld } from '../../src/youtube/main-world';
import { MM_SOURCE } from '../../src/youtube/bridge';

const json3 = {
  events: [
    { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'hello and welcome' }] },
    { tStartMs: 2000, dDurationMs: 3000, segs: [{ utf8: 'today we learn backprop' }] },
  ],
};
const json3Hi = { events: [{ tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'नमस्ते दोस्तों' }] }] };
const json3HiEn = { events: [{ tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'hello friends' }] }] };

type Win = Window & typeof globalThis;
const w = window as Win;
const realFetch = w.fetch;

function playerResponse(videoId: string, tracks: { lang: string; kind?: string; translatable?: boolean }[]) {
  return {
    videoDetails: { videoId, title: 'Neural nets', author: 'Prof X', lengthSeconds: '600', shortDescription: '' },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: tracks.map((t) => ({
          baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${t.lang}${t.kind ? '&kind=' + t.kind : ''}`,
          languageCode: t.lang,
          kind: t.kind,
          name: { simpleText: t.lang },
          isTranslatable: t.translatable ?? true,
        })),
      },
    },
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

let fetchStub: ReturnType<typeof vi.fn>;

beforeEach(() => {
  document.body.innerHTML = '';
  delete (w as any).ytInitialPlayerResponse;
  delete (w as any).ytInitialData;
  fetchStub = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('tlang=en')) return jsonResponse(json3HiEn);
    if (url.includes('lang=hi')) return jsonResponse(json3Hi);
    return jsonResponse(json3);
  });
  w.fetch = fetchStub as any;
});

afterEach(() => {
  w.fetch = realFetch;
  document.documentElement.removeAttribute('data-mm-nonce');
});

function fakePlayer(pr: unknown, initialTrack: Record<string, unknown>) {
  const el = document.createElement('div') as any;
  el.id = 'movie_player';
  let track = initialTrack;
  el.getPlayerResponse = () => pr;
  el.getOption = vi.fn(() => track);
  el.loadModule = vi.fn();
  el.unloadModule = vi.fn();
  el.setOption = vi.fn((mod: string, key: string, value: any) => {
    track = value;
    // The player fetches the selected track (it holds the PO token, we just observe).
    if (value?.languageCode) void w.fetch(`/api/timedtext?v=abc&lang=${value.languageCode}&fmt=json3&pot=XYZ`);
  });
  document.body.appendChild(el);
  return el;
}

describe('main world caption capture', () => {
  it('captures timedtext responses by video id', async () => {
    const store = installHooks(w);
    (w as any).ytInitialPlayerResponse = playerResponse('abc', [{ lang: 'en' }]);
    await w.fetch('/api/timedtext?v=abc&lang=en&fmt=json3');
    await w.fetch('/api/timedtext?v=other&lang=en&fmt=json3');
    expect(await store.waitFor('abc', 'en', undefined, 200)).toBeTruthy();
    const res = await collectCaptions(w, store, { videoId: 'abc', uiLang: 'en' }, { captureWaitMs: 50 });
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.cues).toEqual(parseJson3(json3));
    expect(res.lang).toBe('en');
    expect(res.translatedCues).toBeUndefined();
    expect(res.meta).toMatchObject({ title: 'Neural nets', channel: 'Prof X', duration: 600 });
  });

  it('returns the response to the page unconsumed and without waiting for capture', async () => {
    const store = installHooks(w);
    const tt = '/api/timedtext?v=abc&lang=en&fmt=json3';
    const res = await w.fetch(tt);
    expect(store.find('abc', 'en')).toBeNull(); // capture happens after the page already has res
    expect(await res.text()).toBe(JSON.stringify(json3));
    expect((await store.waitFor('abc', 'en', undefined, 200))?.body).toBe(JSON.stringify(json3));
    expect(await (await w.fetch(tt)).text()).toBe(JSON.stringify(json3));
  });

  it('captures XHR timedtext responses too', async () => {
    const store = installHooks(w);
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/timedtext?v=abc&lang=en&fmt=json3');
    Object.defineProperty(xhr, 'responseText', { value: JSON.stringify(json3) });
    Object.defineProperty(xhr, 'status', { value: 200 });
    xhr.dispatchEvent(new Event('load'));
    expect(store.find('abc', 'en')?.body).toBe(JSON.stringify(json3));
  });

  it('restores captions-off state', async () => {
    const store = installHooks(w);
    const player = fakePlayer(playerResponse('abc', [{ lang: 'en' }]), {});
    const res = await collectCaptions(w, store, { videoId: 'abc', uiLang: 'en' }, { captureWaitMs: 500 });
    expect(res.kind).toBe('ok');
    expect(player.loadModule).toHaveBeenCalledWith('captions');
    expect(player.setOption).toHaveBeenCalledWith('captions', 'track', expect.objectContaining({ languageCode: 'en' }));
    expect(player.unloadModule).toHaveBeenCalledWith('captions');
  });

  it('restores a previously selected track', async () => {
    const store = installHooks(w);
    const prev = { languageCode: 'fr', kind: '' };
    const player = fakePlayer(playerResponse('abc', [{ lang: 'en' }, { lang: 'fr' }]), prev);
    const res = await collectCaptions(w, store, { videoId: 'abc', uiLang: 'en' }, { captureWaitMs: 500 });
    expect(res.kind).toBe('ok');
    expect(player.setOption).toHaveBeenLastCalledWith('captions', 'track', prev);
    expect(player.unloadModule).not.toHaveBeenCalled();
  });

  it('requests tlang=en for non-english', async () => {
    const store = installHooks(w);
    (w as any).ytInitialPlayerResponse = playerResponse('abc', [{ lang: 'hi', kind: 'asr' }]);
    await w.fetch('/api/timedtext?v=abc&lang=hi&kind=asr&fmt=json3&pot=XYZ');
    const res = await collectCaptions(w, store, { videoId: 'abc', uiLang: 'en' }, { captureWaitMs: 50 });
    expect(res.kind).toBe('ok');
    const urls = fetchStub.mock.calls.map((c) => String(c[0]));
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain('tlang=en');
    expect(urls[1]).toContain('fmt=json3');
    expect(urls[1]).toContain('pot=XYZ');
    if (res.kind !== 'ok') return;
    expect(res.lang).toBe('hi');
    expect(res.cues[0].text).toBe('नमस्ते दोस्तों');
    expect(res.translatedCues?.[0].text).toBe('hello friends');
  });

  it('skips translation when the track is not translatable', async () => {
    const store = installHooks(w);
    (w as any).ytInitialPlayerResponse = playerResponse('abc', [{ lang: 'hi', translatable: false }]);
    await w.fetch('/api/timedtext?v=abc&lang=hi&fmt=json3');
    const res = await collectCaptions(w, store, { videoId: 'abc', uiLang: 'en' }, { captureWaitMs: 50 });
    expect(res.kind === 'ok' && res.translatedCues).toBeFalsy();
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it('reports no-captions for videos without tracks', async () => {
    const store = installHooks(w);
    (w as any).ytInitialPlayerResponse = playerResponse('abc', []);
    const res = await collectCaptions(w, store, { videoId: 'abc', uiLang: 'en' }, { captureWaitMs: 50 });
    expect(res.kind).toBe('no-captions');
  });

  it('fails (for DOM fallback) when nothing is captured in time', async () => {
    const store = installHooks(w);
    (w as any).ytInitialPlayerResponse = playerResponse('abc', [{ lang: 'en' }]);
    const res = await collectCaptions(w, store, { videoId: 'abc', uiLang: 'en' }, { captureWaitMs: 30 });
    expect(res.kind).toBe('failed');
  });

  it('prefers player chapter markers over description timestamps', async () => {
    const store = installHooks(w);
    const pr = playerResponse('abc', [{ lang: 'en' }]);
    pr.videoDetails.shortDescription = '0:00 Intro\n1:00 Middle\n2:00 End';
    (w as any).ytInitialPlayerResponse = pr;
    await w.fetch('/api/timedtext?v=abc&lang=en&fmt=json3');
    let res = await collectCaptions(w, store, { videoId: 'abc', uiLang: 'en' }, { captureWaitMs: 50 });
    expect(res.kind === 'ok' && res.creatorChapters.map((c) => c.title)).toEqual(['Intro', 'Middle', 'End']);
    const chap = (t: string, ms: number) => ({ chapterRenderer: { title: { simpleText: t }, timeRangeStartMillis: ms } });
    (w as any).ytInitialData = {
      currentVideoEndpoint: { watchEndpoint: { videoId: 'abc' } },
      playerOverlays: { playerOverlayRenderer: { decoratedPlayerBarRenderer: { decoratedPlayerBarRenderer: {
        playerBar: { multiMarkersPlayerBarRenderer: { markersMap: [
          { key: 'DESCRIPTION_CHAPTERS', value: { chapters: [chap('Start', 0), chap('Body', 120000), chap('Wrap', 400000)] } },
        ] } },
      } } } },
    };
    res = await collectCaptions(w, store, { videoId: 'abc', uiLang: 'en' }, { captureWaitMs: 50 });
    expect(res.kind === 'ok' && res.creatorChapters.map((c) => [c.title, c.start, c.end])).toEqual([
      ['Start', 0, 120],
      ['Body', 120, 400],
      ['Wrap', 400, 600],
    ]);
  });
});

/** A player that ignores setOption (no request), plus YouTube's CC button which does fetch. */
function stubbornPlayer(pr: unknown, pressed: 'true' | 'false', lang = 'en', fetchOnClick = true) {
  const el = document.createElement('div') as any;
  el.id = 'movie_player';
  el.getPlayerResponse = () => pr;
  el.getOption = vi.fn(() => (pressed === 'true' ? { languageCode: lang } : {}));
  el.loadModule = vi.fn();
  el.unloadModule = vi.fn();
  el.setOption = vi.fn(); // real Chrome: no timedtext request follows
  const btn = document.createElement('button');
  btn.className = 'ytp-subtitles-button ytp-button';
  btn.setAttribute('aria-pressed', pressed);
  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on && fetchOnClick) void w.fetch(`/api/timedtext?v=abc&lang=${lang}&fmt=json3&pot=XYZ`);
  });
  const clicks = vi.spyOn(btn, 'click');
  el.appendChild(btn);
  document.body.appendChild(el);
  return { el, btn, clicks };
}

describe('main world capture when the player ignores setOption', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('turns CC on via the button, captures, then turns it back off', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const store = installHooks(w);
    const { el, btn, clicks } = stubbornPlayer(playerResponse('abc', [{ lang: 'en' }]), 'false');
    const p = collectCaptions(w, store, { videoId: 'abc', uiLang: 'en' });
    await vi.advanceTimersByTimeAsync(1400);
    expect(clicks).not.toHaveBeenCalled(); // setOption gets its chance first
    await vi.advanceTimersByTimeAsync(300);
    const res = await p;
    expect(res.kind).toBe('ok');
    expect(res.kind === 'ok' && res.cues).toEqual(parseJson3(json3));
    expect(clicks).toHaveBeenCalledTimes(2);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(el.unloadModule).toHaveBeenCalledWith('captions');
  });

  it('CC already on with a capture for this video (any language): accepted, button untouched', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const store = installHooks(w);
    store.add('https://www.youtube.com/api/timedtext?v=abc&lang=fr&fmt=json3', JSON.stringify(json3));
    const { el, btn, clicks } = stubbornPlayer(playerResponse('abc', [{ lang: 'en' }, { lang: 'fr' }]), 'true', 'fr');
    const p = collectCaptions(w, store, { videoId: 'abc', uiLang: 'en' });
    await vi.advanceTimersByTimeAsync(1600);
    const res = await p;
    expect(res).toMatchObject({ kind: 'ok', lang: 'fr', meta: { lang: 'fr' } });
    expect(clicks).not.toHaveBeenCalled();
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(el.setOption).toHaveBeenLastCalledWith('captions', 'track', { languageCode: 'fr' });
    expect(el.unloadModule).not.toHaveBeenCalled();
  });

  it('CC already on but nothing captured: toggles off/on once to force a fetch, ends ON', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const store = installHooks(w);
    const { el, btn, clicks } = stubbornPlayer(playerResponse('abc', [{ lang: 'en' }, { lang: 'fr' }]), 'true', 'fr');
    const p = collectCaptions(w, store, { videoId: 'abc', uiLang: 'en' });
    await vi.advanceTimersByTimeAsync(1600);
    const res = await p;
    expect(res).toMatchObject({ kind: 'ok', lang: 'fr' });
    expect(clicks).toHaveBeenCalledTimes(2);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(el.setOption).toHaveBeenLastCalledWith('captions', 'track', { languageCode: 'fr' });
  });

  it('CC already on and the toggle fetches nothing: failed, CC still ON', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const store = installHooks(w);
    const { btn, clicks } = stubbornPlayer(playerResponse('abc', [{ lang: 'en' }]), 'true', 'en', false);
    const p = collectCaptions(w, store, { videoId: 'abc', uiLang: 'en' });
    await vi.advanceTimersByTimeAsync(7100);
    expect(await p).toMatchObject({ kind: 'failed', error: 'no timedtext captured' });
    expect(clicks).toHaveBeenCalledTimes(2);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('CC click loads a different language than picked: uses it (lang, translation), restores CC', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const store = installHooks(w);
    const { el, btn, clicks } = stubbornPlayer(playerResponse('abc', [{ lang: 'en' }]), 'false', 'de');
    const p = collectCaptions(w, store, { videoId: 'abc', uiLang: 'en' });
    await vi.advanceTimersByTimeAsync(1600);
    const res = await p;
    expect(res).toMatchObject({ kind: 'ok', lang: 'de', meta: { lang: 'de' } });
    expect(fetchStub.mock.calls.map((c) => String(c[0])).some((u) => u.includes('lang=de') && u.includes('tlang=en'))).toBe(true);
    expect(res.kind === 'ok' && res.translatedCues?.[0].text).toBe('hello friends');
    expect(clicks).toHaveBeenCalledTimes(2);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(el.unloadModule).toHaveBeenCalledWith('captions');
  });

  it("picked 'en' but YouTube's default is 'hi': indexes Hindi with an English translation", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const store = installHooks(w);
    stubbornPlayer(playerResponse('abc', [{ lang: 'en' }, { lang: 'hi' }]), 'false', 'hi');
    const p = collectCaptions(w, store, { videoId: 'abc', uiLang: 'en' });
    await vi.advanceTimersByTimeAsync(1600);
    const res = await p;
    expect(res).toMatchObject({ kind: 'ok', lang: 'hi', meta: { lang: 'hi' } });
    if (res.kind !== 'ok') return;
    expect(res.cues[0].text).toBe('नमस्ते दोस्तों');
    expect(res.translatedCues?.[0].text).toBe('hello friends');
  });

  it('genuinely no capture after the CC click: failed, CC restored off', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const store = installHooks(w);
    const { el, btn, clicks } = stubbornPlayer(playerResponse('abc', [{ lang: 'en' }]), 'false', 'en', false);
    const p = collectCaptions(w, store, { videoId: 'abc', uiLang: 'en' });
    await vi.advanceTimersByTimeAsync(7100);
    expect(await p).toMatchObject({ kind: 'failed', error: 'no timedtext captured' });
    expect(clicks).toHaveBeenCalledTimes(2);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(el.unloadModule).toHaveBeenCalledWith('captions');
  });

  it('accepts a capture that arrives at ~5 s (default 7 s budget)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const store = installHooks(w);
    stubbornPlayer(playerResponse('abc', [{ lang: 'en' }]), 'true');
    setTimeout(() => store.add('https://www.youtube.com/api/timedtext?v=abc&lang=en&fmt=json3', JSON.stringify(json3)), 5000);
    const p = collectCaptions(w, store, { videoId: 'abc', uiLang: 'en' });
    await vi.advanceTimersByTimeAsync(5100);
    expect((await p).kind).toBe('ok');
  });
});

describe('main world messaging', () => {
  it('ignores messages without nonce', async () => {
    const mw = startMainWorld(w, { captureWaitMs: 20 });
    (w as any).ytInitialPlayerResponse = playerResponse('abc', []);
    document.documentElement.setAttribute('data-mm-nonce', 'n-123');
    const replies: any[] = [];
    const onMsg = (e: MessageEvent) => {
      if (e.data?.source === MM_SOURCE && e.data?.type === 'mm:captions-result') replies.push(e.data);
    };
    w.addEventListener('message', onMsg);
    try {
      const req = { source: MM_SOURCE, type: 'mm:get-captions', id: 'r1', videoId: 'abc', uiLang: 'en' };
      w.postMessage(req, '*');
      w.postMessage({ ...req, id: 'r2', nonce: 'wrong' }, '*');
      await new Promise((r) => setTimeout(r, 60));
      expect(replies).toEqual([]);
      w.postMessage({ ...req, id: 'r3', nonce: 'n-123' }, '*');
      await vi.waitFor(() => expect(replies).toHaveLength(1));
      expect(replies[0]).toMatchObject({ id: 'r3', nonce: 'n-123', result: { kind: 'no-captions' } });
    } finally {
      w.removeEventListener('message', onMsg);
      mw.stop();
    }
  });
});
