import type { CaptionResult } from './youtube/captions';

/** Side panel connects a port with this name to the background. */
export const PANEL_PORT = 'mm-panel';

export type PanelToPage = { t: 'getCaptions' } | { t: 'seek'; time: number; play?: boolean } | { t: 'pause' };

export type PageToPanel =
  | { t: 'video'; videoId: string | null; title?: string }
  | { t: 'time'; time: number; playing: boolean }
  | { t: 'captions'; result: CaptionResult }
  | { t: 'newNote'; time: number };

/** Page -> background only (never reaches the panel). */
export type PageToBackground = { t: 'watched'; videoId: string; range: [number, number] } | { t: 'hello' };

/** Background -> content script control messages (in addition to PanelToPage). */
export type BackgroundToPage =
  | PanelToPage
  | { t: 'panel'; connected: boolean }
  | { t: 'getState' }
  | { t: 'pauseGetTime' };

export type PageMessage = PageToPanel | PageToBackground;

const PANEL_BOUND = new Set(['video', 'time', 'captions', 'newNote']);
export function isPageToPanel(m: unknown): m is PageToPanel {
  return !!m && typeof m === 'object' && PANEL_BOUND.has((m as { t?: string }).t ?? '');
}
export function isPageToBackground(m: unknown): m is PageToBackground {
  return !!m && typeof m === 'object' && ['watched', 'hello'].includes((m as { t?: string }).t ?? '');
}
