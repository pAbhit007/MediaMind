/**
 * Secondary caption path: open YouTube's "Show transcript" panel off-screen, read the rows,
 * close it again. The panel is positioned off-screen by a class on <html> that is added
 * before the click and always removed in `finally`, so nothing flickers on screen.
 * Last resort only: captions.ts caps it with a hard timeout.
 *
 * TODO: YouTube's new transcript UI (engagement panel target-id "PAmodern_transcript_view") no
 * longer renders ytd-transcript-segment-renderer rows, so this returns [] there. Teach it the new
 * markup once we can inspect it on a real signed-in Chrome.
 */
import { cleanCueText, type Cue } from '@mediamind/engine';

export const OFFSCREEN_CLASS = 'mm-transcript-offscreen';
const STYLE_ID = 'mm-transcript-offscreen-style';
const PANEL_SEL = 'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]';
const ROW_SEL = 'ytd-transcript-segment-renderer';
const EXPANDED = 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED';
const HIDDEN = 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN';
const POLL_MS = 50;

export type ReadOptions = { timeoutMs?: number; closeDelayMs?: number; duration?: number };

/** "1:02:03" -> 3723, "0:04" -> 4; NaN when unparseable. */
export function parseTimestamp(s: string): number {
  const t = s.trim();
  if (!/^\d{1,3}(:\d{1,2}){1,2}$/.test(t)) return NaN;
  return t.split(':').reduce((acc, p) => acc * 60 + parseInt(p, 10), 0);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ensureStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    `html.${OFFSCREEN_CLASS} ${PANEL_SEL}{position:fixed!important;left:-10000px!important;top:0!important;` +
    `width:400px!important;height:600px!important;opacity:0!important;pointer-events:none!important;}`;
  (doc.head ?? doc.documentElement).appendChild(style);
}

function findShowButton(doc: Document): HTMLElement | null {
  const direct = doc.querySelector<HTMLElement>('ytd-video-description-transcript-section-renderer button');
  if (direct) return direct;
  const scope = doc.querySelectorAll<HTMLElement>('#description button, ytd-watch-metadata button');
  for (const b of scope) {
    const label = `${b.getAttribute('aria-label') ?? ''} ${b.textContent ?? ''}`;
    if (/transcript/i.test(label)) return b;
  }
  return null;
}

function rowsOf(doc: Document): Element[] {
  const panel = doc.querySelector(PANEL_SEL);
  return panel ? [...panel.querySelectorAll(ROW_SEL)] : [];
}

/** Wait until rows exist and the count is stable across two polls (rows arrive in one batch). */
async function waitForRows(doc: Document, timeoutMs: number): Promise<Element[]> {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  while (Date.now() < deadline) {
    const rows = rowsOf(doc);
    if (rows.length > 0 && rows.length === last) return rows;
    last = rows.length;
    await sleep(POLL_MS);
  }
  return rowsOf(doc);
}

function parseRows(rows: Element[], duration?: number): Cue[] {
  const raw = rows
    .map((r) => ({
      start: parseTimestamp(r.querySelector('.segment-timestamp')?.textContent ?? ''),
      text: cleanCueText(r.querySelector('.segment-text')?.textContent ?? ''),
    }))
    .filter((r) => Number.isFinite(r.start))
    .sort((a, b) => a.start - b.start);
  const cues: Cue[] = [];
  raw.forEach((r, i) => {
    if (!r.text) return;
    const next = raw[i + 1]?.start;
    const dur = next !== undefined ? next - r.start : duration ? Math.max(0, duration - r.start) : 0;
    cues.push({ start: r.start, dur, text: r.text });
  });
  return cues;
}

function closePanel(doc: Document): void {
  const panel = doc.querySelector(PANEL_SEL);
  if (!panel) return;
  const btn =
    panel.querySelector<HTMLElement>('#visibility-button button') ??
    panel.querySelector<HTMLElement>('button[aria-label*="Close" i]');
  if (btn) btn.click();
  else panel.setAttribute('visibility', HIDDEN);
}

export async function readTranscriptPanel(doc: Document, opts: ReadOptions = {}): Promise<Cue[]> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const closeDelayMs = opts.closeDelayMs ?? 300;

  // The user already has the transcript open: read it, leave it as it is.
  if (doc.querySelector(PANEL_SEL)?.getAttribute('visibility') === EXPANDED) {
    return parseRows(await waitForRows(doc, timeoutMs), opts.duration);
  }

  const button = findShowButton(doc);
  if (!button) return [];

  const html = doc.documentElement;
  ensureStyle(doc);
  html.classList.add(OFFSCREEN_CLASS);
  try {
    button.click();
    return parseRows(await waitForRows(doc, timeoutMs), opts.duration);
  } catch {
    return [];
  } finally {
    try {
      closePanel(doc);
    } catch {
      /* ignore */
    }
    // Let the close transition finish while still off-screen.
    if (closeDelayMs > 0) await sleep(closeDelayMs);
    html.classList.remove(OFFSCREEN_CLASS);
  }
}
