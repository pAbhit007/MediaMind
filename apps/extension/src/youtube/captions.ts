/**
 * Content-script (isolated world) side of caption capture. Asks the main-world script for the
 * player's captions; on failure or timeout falls back to reading the transcript panel.
 */
import { parseDescriptionChapters, type Chapter, type Cue } from '@mediamind/engine';
import { MM_SOURCE, NONCE_ATTR, readNonce, type MainMeta, type MainPayload, type MainRequest } from './bridge';
import { readTranscriptPanel } from './transcript-dom';

export type CaptionResult =
  | {
      kind: 'ok';
      videoId: string;
      title: string;
      channel: string;
      duration: number;
      lang: string;
      cues: Cue[];
      translatedCues?: Cue[];
      creatorChapters: Chapter[];
      via: 'timedtext' | 'dom';
    }
  | {
      kind: 'none';
      videoId: string;
      title: string;
      reason: 'no-captions' | 'failed';
      /** Why it failed (e.g. the main world's 'no timedtext captured'); for logs, not UI copy. */
      detail?: string;
    };

type NoneResult = Extract<CaptionResult, { kind: 'none' }>;

function none(videoId: string, title: string, reason: NoneResult['reason'], detail?: string): NoneResult {
  console.warn('MediaMind: captions', reason, detail);
  return { kind: 'none', videoId, title, reason, ...(detail ? { detail } : {}) };
}

export type GetCaptionsOptions = {
  /** Total budget for the main-world path before falling back to the DOM (default 20 s). */
  timeoutMs?: number;
  /** Hard cap on the DOM fallback so it can never hang the request (default 8 s). */
  domTimeoutMs?: number;
  /** DOM reader, injectable for tests. */
  readDom?: (duration: number) => Promise<Cue[]>;
};

/** Per-page random nonce shared with the main world through <html data-mm-nonce>. */
export function ensureNonce(doc: Document = document): string {
  const existing = readNonce(doc);
  if (existing) return existing;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  doc.documentElement.setAttribute(NONCE_ATTR, nonce);
  return nonce;
}

function askMainWorld(videoId: string, uiLang: string, timeoutMs: number): Promise<MainPayload | null> {
  const nonce = ensureNonce();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve) => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.source !== MM_SOURCE || d.type !== 'mm:captions-result') return;
      if (d.nonce !== nonce || d.id !== id) return;
      done(d.result as MainPayload);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    const done = (v: MainPayload | null) => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(v);
    };
    window.addEventListener('message', onMessage);
    const req: MainRequest = { source: MM_SOURCE, type: 'mm:get-captions', nonce, id, videoId, uiLang };
    window.postMessage(req, window.location.origin === 'null' ? '*' : window.location.origin);
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<T>((resolve) => (timer = setTimeout(() => resolve(fallback), ms)));
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

function metaFromDom(videoId: string): MainMeta {
  const text = (sel: string) => document.querySelector(sel)?.textContent?.trim() ?? '';
  const title = text('ytd-watch-metadata h1') || document.title.replace(/\s*-\s*YouTube\s*$/, '');
  const video = document.querySelector('video');
  const duration = video && Number.isFinite(video.duration) ? video.duration : 0;
  return {
    videoId,
    title,
    channel: text('ytd-watch-metadata ytd-channel-name a') || text('ytd-channel-name a'),
    duration,
    description: '',
  };
}

export async function getCaptions(
  videoId: string,
  uiLang: string,
  opts: GetCaptionsOptions = {},
): Promise<CaptionResult> {
  let title = '';
  let detail: string | undefined;
  try {
    // Main world worst case: 7 s capture + 2 x 4 s fetches = 15 s, so 20 s leaves headroom.
    const main = await askMainWorld(videoId, uiLang, opts.timeoutMs ?? 20000);
    if (main?.meta) title = main.meta.title;

    if (main?.kind === 'ok') {
      const m = main.meta;
      return {
        kind: 'ok',
        videoId,
        title: m.title,
        channel: m.channel,
        duration: m.duration,
        lang: main.lang,
        cues: main.cues,
        ...(main.translatedCues?.length ? { translatedCues: main.translatedCues } : {}),
        creatorChapters: main.creatorChapters,
        via: 'timedtext',
      };
    }
    if (main?.kind === 'no-captions') return none(videoId, title, 'no-captions');
    detail = main ? main.error : 'main world timed out';

    // Main world failed or timed out: last resort, read YouTube's own transcript panel.
    // TODO: YouTube's new transcript UI (engagement panel PAmodern_transcript_view) no longer
    // renders ytd-transcript-segment-renderer rows, so this usually returns [] today.
    const meta = main?.meta ?? metaFromDom(videoId);
    title = meta.title;
    const readDom = opts.readDom ?? ((duration: number) => readTranscriptPanel(document, { duration }));
    const cues = await withTimeout(readDom(meta.duration), opts.domTimeoutMs ?? 8000, [] as Cue[]);
    if (!cues.length) return none(videoId, title, 'failed', detail);
    const duration = meta.duration || cues[cues.length - 1].start + cues[cues.length - 1].dur;
    return {
      kind: 'ok',
      videoId,
      title,
      channel: meta.channel,
      duration,
      // Unknown language -> 'und' keeps the engine in keyword mode rather than guessing English.
      lang: meta.lang ?? 'und',
      cues,
      creatorChapters: parseDescriptionChapters(meta.description, duration),
      via: 'dom',
    };
  } catch (e) {
    return none(videoId, title, 'failed', detail ?? String((e as Error)?.message ?? e));
  }
}
