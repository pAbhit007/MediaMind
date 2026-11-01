/**
 * Runs in the page's MAIN world (document_start). Observes the player's own timedtext
 * requests (which carry YouTube's proof-of-origin token) instead of making our own, and
 * answers caption requests from the isolated content script over window.postMessage.
 */
import { parseDescriptionChapters, parseJson3, pickTrack } from '@mediamind/engine';
import type { CaptionTrack, Chapter, Cue } from '@mediamind/engine';
import { MM_SOURCE, readNonce, type MainMeta, type MainPayload, type MainReply } from './bridge';

type Win = Window & typeof globalThis;

const STORE_KEY = '__mediamindCaptureStore';
const ORIG = Symbol.for('mediamind.origFetch');
const XHR_PATCHED = Symbol.for('mediamind.xhrPatched');
const XHR_URL = Symbol.for('mediamind.xhrUrl');
const MAX_ENTRIES = 30;

export type Capture = { url: string; videoId: string; lang: string; kind: string; tlang: string; body: string };
type Entry = Capture & { seq: number };

export class CaptureStore {
  private entries: Entry[] = [];
  private waiters = new Set<() => void>();
  private seq = 0;

  constructor(private readonly base: string) {}

  add(rawUrl: string, body: string): void {
    let u: URL;
    try {
      u = new URL(rawUrl, this.base);
    } catch {
      return;
    }
    const videoId = u.searchParams.get('v');
    if (!u.pathname.includes('/api/timedtext') || !videoId || !body) return;
    this.entries.push({
      seq: this.seq++,
      url: u.href,
      videoId,
      lang: u.searchParams.get('lang') ?? '',
      kind: u.searchParams.get('kind') ?? '',
      tlang: u.searchParams.get('tlang') ?? '',
      body,
    });
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
    for (const w of [...this.waiters]) w();
  }

  /** Latest untranslated capture for this video + language (exact kind preferred). */
  find(videoId: string, lang: string, kind?: 'asr' | 'manual'): Capture | null {
    const of = this.entries.filter((e) => e.videoId === videoId && e.lang === lang && !e.tlang).reverse();
    if (!kind) return of[0] ?? null;
    const want = kind === 'asr' ? 'asr' : '';
    return of.find((e) => e.kind === want) ?? of[0] ?? null;
  }

  /** Snapshot for `findAny`: captures added after this point have seq >= mark(). */
  mark(): number {
    return this.seq;
  }

  /**
   * Latest untranslated capture for this video that arrived at or after `sinceIndex` (a `mark()`),
   * in any language; an exact lang (+kind) match is preferred when given.
   */
  findAny(videoId: string, sinceIndex: number, lang?: string, kind?: 'asr' | 'manual'): Capture | null {
    const of = this.entries.filter((e) => e.videoId === videoId && e.seq >= sinceIndex && !e.tlang).reverse();
    if (lang) {
      const want = kind === 'asr' ? 'asr' : kind === 'manual' ? '' : null;
      const exact = of.find((e) => e.lang === lang && (want === null || e.kind === want)) ?? of.find((e) => e.lang === lang);
      if (exact) return exact;
    }
    return of[0] ?? null;
  }

  waitFor(videoId: string, lang: string, kind: 'asr' | 'manual' | undefined, ms: number): Promise<Capture | null> {
    return this.waitUntil(() => this.find(videoId, lang, kind), ms);
  }

  /** Exact match (any time) or any untranslated capture for this video since `sinceIndex`. */
  waitForAny(
    videoId: string,
    lang: string,
    kind: 'asr' | 'manual' | undefined,
    sinceIndex: number,
    ms: number,
  ): Promise<Capture | null> {
    return this.waitUntil(() => this.find(videoId, lang, kind) ?? this.findAny(videoId, sinceIndex, lang, kind), ms);
  }

  private waitUntil(get: () => Capture | null, ms: number): Promise<Capture | null> {
    const hit = get();
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve) => {
      const check = () => {
        const h = get();
        if (h) done(h);
      };
      const timer = setTimeout(() => done(null), ms);
      const done = (v: Capture | null) => {
        clearTimeout(timer);
        this.waiters.delete(check);
        resolve(v);
      };
      this.waiters.add(check);
    });
  }
}

const isTimedtext = (url: string) => url.includes('/api/timedtext');

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return (input as Request).url;
}

function storeOf(win: Win): CaptureStore | undefined {
  return (win as any)[STORE_KEY];
}

/** The page's fetch as it was before our hook (used for our own translation requests). */
function origFetch(win: Win): typeof fetch {
  const f = win.fetch as any;
  return (f[ORIG] ?? f).bind(win);
}

/** Wrap fetch + XHR to remember timedtext responses. Never alters what the page receives. */
export function installHooks(win: Win): CaptureStore {
  const store = new CaptureStore(win.location.href);
  (win as any)[STORE_KEY] = store;

  const current = win.fetch as any;
  if (typeof current === 'function' && !current[ORIG]) {
    const wrapped = async function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      const res: Response = await current.call(win, input, init);
      try {
        const url = urlOf(input);
        if (isTimedtext(url) && res.ok) {
          // Read a clone in the background; the page gets its Response without waiting.
          res
            .clone()
            .text()
            .then((body) => storeOf(win)?.add(url, body), () => {});
        }
      } catch {
        /* never break the page */
      }
      return res;
    };
    (wrapped as any)[ORIG] = current;
    win.fetch = wrapped as typeof fetch;
  }

  const proto = win.XMLHttpRequest?.prototype as any;
  if (proto && !proto[XHR_PATCHED]) {
    proto[XHR_PATCHED] = true;
    const open = proto.open;
    proto.open = function (this: any, method: string, url: string | URL, ...rest: unknown[]) {
      try {
        const u = String(url);
        if (isTimedtext(u)) {
          const first = !this[XHR_URL];
          this[XHR_URL] = u;
          if (first) {
            this.addEventListener('load', () => {
              try {
                if (this.status < 200 || this.status >= 300) return;
                const rt = this.responseType;
                const body =
                  rt === '' || rt === 'text' ? this.responseText : rt === 'json' ? JSON.stringify(this.response) : '';
                if (body) storeOf(win)?.add(this[XHR_URL], body);
              } catch {
                /* ignore */
              }
            });
          }
        }
      } catch {
        /* ignore */
      }
      return open.call(this, method, url, ...rest);
    };
  }
  return store;
}

type Player = {
  getPlayerResponse?: () => any;
  getOption?: (mod: string, key: string) => any;
  setOption?: (mod: string, key: string, value: unknown) => void;
  loadModule?: (mod: string) => void;
  unloadModule?: (mod: string) => void;
  getDuration?: () => number;
};

function getPlayer(win: Win): Player | null {
  const el = win.document.getElementById('movie_player') as unknown as Player | null;
  return el && typeof el.getPlayerResponse === 'function' ? el : null;
}

function getPlayerResponse(win: Win, videoId: string): any {
  try {
    const pr = getPlayer(win)?.getPlayerResponse?.();
    if (pr?.videoDetails?.videoId === videoId) return pr;
  } catch {
    /* ignore */
  }
  const init = (win as any).ytInitialPlayerResponse;
  return init?.videoDetails?.videoId === videoId ? init : null;
}

const textOf = (t: any): string =>
  typeof t?.simpleText === 'string' ? t.simpleText : Array.isArray(t?.runs) ? t.runs.map((r: any) => r?.text ?? '').join('') : '';

function readTracks(pr: any): CaptionTrack[] {
  const raw = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t: any) => t && typeof t.baseUrl === 'string' && typeof t.languageCode === 'string')
    .map((t: any) => ({
      languageCode: t.languageCode,
      kind: t.kind === 'asr' ? 'asr' : 'manual',
      name: textOf(t.name),
      baseUrl: t.baseUrl,
      isTranslatable: !!t.isTranslatable,
    }));
}

function readMeta(win: Win, pr: any, videoId: string): MainMeta {
  const d = pr?.videoDetails ?? {};
  let duration = Number(d.lengthSeconds) || 0;
  if (!duration) {
    try {
      duration = Number(getPlayer(win)?.getDuration?.()) || 0;
    } catch {
      /* ignore */
    }
  }
  return {
    videoId,
    title: String(d.title ?? ''),
    channel: String(d.author ?? ''),
    duration,
    description: String(d.shortDescription ?? ''),
  };
}

/** Creator chapters from the player bar markers (ytInitialData), if they belong to this video. */
export function readPlayerChapters(win: Win, videoId: string, duration: number): Chapter[] {
  try {
    const data = (win as any).ytInitialData;
    if (data?.currentVideoEndpoint?.watchEndpoint?.videoId !== videoId) return [];
    const map =
      data?.playerOverlays?.playerOverlayRenderer?.decoratedPlayerBarRenderer?.decoratedPlayerBarRenderer?.playerBar
        ?.multiMarkersPlayerBarRenderer?.markersMap;
    if (!Array.isArray(map)) return [];
    const entry = map.find((m: any) => m?.key === 'DESCRIPTION_CHAPTERS');
    const raw = entry?.value?.chapters;
    if (!Array.isArray(raw)) return [];
    const pts: { start: number; title: string }[] = [];
    for (const c of raw) {
      const r = c?.chapterRenderer;
      const start = Number(r?.timeRangeStartMillis) / 1000;
      if (!Number.isFinite(start) || (duration && start >= duration)) continue;
      if (pts.length && start <= pts[pts.length - 1].start) continue;
      pts.push({ start, title: textOf(r?.title).trim() || `Chapter ${pts.length + 1}` });
    }
    if (pts.length < 2) return [];
    return pts.map((p, i) => ({
      idx: i,
      start: p.start,
      end: i + 1 < pts.length ? pts[i + 1].start : duration,
      title: p.title,
      source: 'creator' as const,
      keywords: [],
    }));
  } catch {
    return [];
  }
}

function withParams(url: string, params: Record<string, string>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.href;
}

async function fetchJson3(win: Win, url: string, ms: number): Promise<Cue[]> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await origFetch(win)(url, { credentials: 'include', signal: ctl.signal });
    if (!res.ok) return [];
    return parseJson3(JSON.parse(await res.text()));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function parseBody(body: string): Cue[] {
  try {
    return parseJson3(JSON.parse(body));
  } catch {
    return []; // e.g. srv3 XML; caller re-requests as json3
  }
}

const CC_BUTTON_SEL = '#movie_player .ytp-subtitles-button';

const ccButton = (win: Win) => win.document.querySelector<HTMLElement>(CC_BUTTON_SEL);

/**
 * Switch the player to `track` until it fetches it, then restore the user's caption state.
 * Real Chrome sometimes ignores setOption (no timedtext request); after `ccFallbackMs` we use
 * YouTube's own CC button instead:
 *  - CC off: click it on (and back off afterwards).
 *  - CC on: accept whatever the player already fetched for this video; if nothing, toggle it
 *    off and on once to force a fetch (it ends ON, as the user had it).
 * Once we fall back, YouTube may load its default track in another language than `track`; any
 * untranslated capture for this video is accepted and the caller uses the capture's language.
 */
async function captureViaPlayer(
  win: Win,
  player: Player,
  store: CaptureStore,
  videoId: string,
  track: CaptionTrack,
  waitMs: number,
  ccFallbackMs: number,
): Promise<Capture | null> {
  const firstWait = Math.min(ccFallbackMs, waitMs);
  let prev: any = {};
  try {
    prev = player.getOption?.('captions', 'track') ?? {};
  } catch {
    prev = {};
  }
  const wasOn = !!prev?.languageCode;
  const want = { languageCode: track.languageCode, ...(track.kind === 'asr' ? { kind: 'asr' } : {}) };
  const lang = track.languageCode;
  let btn: HTMLElement | null = null;
  let pressedBefore: string | null = null;
  let touched = false;
  try {
    const since = store.mark();
    player.loadModule?.('captions');
    player.setOption?.('captions', 'track', want);
    let cap = await store.waitFor(videoId, lang, track.kind, firstWait);
    if (cap) return cap;

    btn = ccButton(win);
    pressedBefore = btn?.getAttribute('aria-pressed') ?? null;
    if (btn && pressedBefore === 'true') {
      // Captions are showing: whatever the player fetched for this video is good enough.
      cap = store.findAny(videoId, 0, lang, track.kind);
      if (cap) return cap;
      touched = true;
      btn.click(); // off
      btn.click(); // on again: forces a fresh timedtext request
    } else if (btn && pressedBefore === 'false') {
      touched = true;
      btn.click();
      try {
        player.setOption?.('captions', 'track', want); // now that captions are on, aim at our track
      } catch {
        /* ignore */
      }
    }
    const left = waitMs - firstWait;
    if (left <= 0) return null;
    return await store.waitForAny(videoId, lang, track.kind, touched ? since : Number.POSITIVE_INFINITY, left);
  } finally {
    try {
      // Put the CC button back exactly as it was, then the module/track state.
      if (touched && btn && pressedBefore && btn.getAttribute('aria-pressed') !== pressedBefore) btn.click();
    } catch {
      /* ignore */
    }
    try {
      if (wasOn) player.setOption?.('captions', 'track', prev);
      else player.unloadModule?.('captions');
    } catch {
      /* ignore */
    }
  }
}

export type CollectOptions = {
  /** Total wait for the player's own timedtext request (default 7 s). */
  captureWaitMs?: number;
  /** How long setOption gets before we fall back to clicking the CC button (default 1.5 s). */
  ccFallbackMs?: number;
  /** Per json3/translation fetch (default 4 s). */
  fetchTimeoutMs?: number;
};

export async function collectCaptions(
  win: Win,
  store: CaptureStore,
  req: { videoId: string; uiLang: string },
  opts: CollectOptions = {},
): Promise<MainPayload> {
  const captureWaitMs = opts.captureWaitMs ?? 7000;
  const ccFallbackMs = opts.ccFallbackMs ?? 1500;
  // 7 s capture + 2 x 4 s fetches = 15 s, inside the content script's 20 s budget.
  const fetchTimeoutMs = opts.fetchTimeoutMs ?? 4000;
  const { videoId, uiLang } = req;
  let meta: MainMeta | undefined;
  try {
    const pr = getPlayerResponse(win, videoId);
    if (!pr) return { kind: 'failed', error: 'player response not available' };
    meta = readMeta(win, pr, videoId);
    const tracks = readTracks(pr);
    const track = pickTrack(tracks, uiLang);
    if (!track) return { kind: 'no-captions', meta };
    meta.lang = track.languageCode;

    let cap = store.find(videoId, track.languageCode, track.kind);
    if (!cap) {
      const player = getPlayer(win);
      if (player) cap = await captureViaPlayer(win, player, store, videoId, track, captureWaitMs, ccFallbackMs);
      else cap = await store.waitFor(videoId, track.languageCode, track.kind, captureWaitMs);
    }
    if (!cap) return { kind: 'failed', meta, error: 'no timedtext captured' };
    // The capture may be YouTube's default track rather than the one we picked: trust the capture.
    const lang = cap.lang || track.languageCode;
    meta.lang = lang;
    const capTrack =
      tracks.find((t) => t.languageCode === lang && t.kind === (cap!.kind === 'asr' ? 'asr' : 'manual')) ??
      tracks.find((t) => t.languageCode === lang);

    let cues = parseBody(cap.body);
    if (!cues.length) cues = await fetchJson3(win, withParams(cap.url, { fmt: 'json3' }), fetchTimeoutMs);
    if (!cues.length) return { kind: 'failed', meta, error: 'captured captions were empty' };

    let translatedCues: Cue[] | undefined;
    const isEnglish = lang.toLowerCase().split(/[-_]/)[0] === 'en';
    if (!isEnglish && (capTrack ?? track).isTranslatable) {
      const t = await fetchJson3(win, withParams(cap.url, { tlang: 'en', fmt: 'json3' }), fetchTimeoutMs);
      if (t.length) translatedCues = t;
    }

    const fromPlayer = readPlayerChapters(win, videoId, meta.duration);
    const creatorChapters = fromPlayer.length ? fromPlayer : parseDescriptionChapters(meta.description, meta.duration);
    return {
      kind: 'ok',
      meta,
      lang,
      cues,
      ...(translatedCues ? { translatedCues } : {}),
      creatorChapters,
    };
  } catch (e) {
    return { kind: 'failed', meta, error: String((e as Error)?.message ?? e) };
  }
}

/** Entry point for the MAIN-world content script. */
export function startMainWorld(win: Win, opts: CollectOptions = {}): { store: CaptureStore; stop: () => void } {
  const store = installHooks(win);
  let queue: Promise<unknown> = Promise.resolve(); // one player toggle at a time
  const onMessage = (e: MessageEvent) => {
    const d = e.data;
    if (!d || d.source !== MM_SOURCE || d.type !== 'mm:get-captions') return;
    const nonce = readNonce(win.document);
    if (!nonce || d.nonce !== nonce) return;
    if (typeof d.videoId !== 'string' || typeof d.id !== 'string') return;
    const run = () =>
      collectCaptions(win, store, { videoId: d.videoId, uiLang: String(d.uiLang ?? 'en') }, opts).then((result) => {
        const reply: MainReply = { source: MM_SOURCE, type: 'mm:captions-result', nonce, id: d.id, result };
        win.postMessage(reply, win.location.origin === 'null' ? '*' : win.location.origin);
      });
    queue = queue.then(run, run);
  };
  win.addEventListener('message', onMessage);
  return { store, stop: () => win.removeEventListener('message', onMessage) };
}
