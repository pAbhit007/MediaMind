import type { Chapter, Cue } from '@mediamind/engine';

/** Shared protocol between the main-world script and the isolated content script. */
export const MM_SOURCE = 'mediamind';
export const NONCE_ATTR = 'data-mm-nonce';

export type MainMeta = {
  videoId: string;
  title: string;
  channel: string;
  duration: number;
  description: string;
  /** Language of the chosen caption track, when one was picked. */
  lang?: string;
};

export type MainPayload =
  | { kind: 'ok'; meta: MainMeta; lang: string; cues: Cue[]; translatedCues?: Cue[]; creatorChapters: Chapter[] }
  | { kind: 'no-captions'; meta: MainMeta }
  | { kind: 'failed'; meta?: MainMeta; error: string };

export type MainRequest = {
  source: typeof MM_SOURCE;
  type: 'mm:get-captions';
  nonce: string;
  id: string;
  videoId: string;
  uiLang: string;
};

export type MainReply = {
  source: typeof MM_SOURCE;
  type: 'mm:captions-result';
  nonce: string;
  id: string;
  result: MainPayload;
};

export function readNonce(doc: Document): string | null {
  return doc.documentElement.getAttribute(NONCE_ATTR) || null;
}
