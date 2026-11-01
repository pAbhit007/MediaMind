import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readTranscriptPanel, parseTimestamp, OFFSCREEN_CLASS } from '../../src/youtube/transcript-dom';

const fixture = readFileSync(resolve(__dirname, '../fixtures/transcript-panel.html'), 'utf8');
const PANEL = 'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]';

let opened = 0;
let closed = 0;

beforeEach(() => {
  document.body.innerHTML = fixture;
  document.documentElement.classList.remove(OFFSCREEN_CLASS);
  opened = closed = 0;
  const panel = document.querySelector(PANEL)!;
  document.querySelector('button[aria-label="Show transcript"]')!.addEventListener('click', () => {
    opened++;
    // While open, the panel must already be pushed off-screen by the class on <html>.
    expect(document.documentElement.classList.contains(OFFSCREEN_CLASS)).toBe(true);
    panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
  });
  document.querySelector('button[aria-label="Close transcript"]')!.addEventListener('click', () => {
    closed++;
    panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
  });
});

describe('transcript DOM fallback', () => {
  it('parses timestamps', () => {
    expect(parseTimestamp(' 1:02:03 ')).toBe(3723);
    expect(parseTimestamp('0:04')).toBe(4);
    expect(parseTimestamp('12:30')).toBe(750);
    expect(parseTimestamp('soon')).toBeNaN();
  });

  it('reads transcript panel fixture', async () => {
    const cues = await readTranscriptPanel(document, { timeoutMs: 500, closeDelayMs: 0, duration: 3730 });
    expect(cues.map((c) => [c.start, c.text])).toEqual([
      [0, 'Welcome back to the course'],
      [4, 'today we look at gradients'],
      [3723, "and that's the chain rule"],
    ]);
    expect(cues[0].dur).toBe(4);
    expect(cues[2].dur).toBe(7);
    expect(opened).toBe(1);
    expect(closed).toBe(1);
    expect(document.documentElement.classList.contains(OFFSCREEN_CLASS)).toBe(false);
  });

  it('cleans up and returns [] when no rows appear', async () => {
    document.querySelectorAll('ytd-transcript-segment-renderer').forEach((n) => n.remove());
    const cues = await readTranscriptPanel(document, { timeoutMs: 80, closeDelayMs: 0 });
    expect(cues).toEqual([]);
    expect(closed).toBe(1);
    expect(document.documentElement.classList.contains(OFFSCREEN_CLASS)).toBe(false);
  });

  it('returns [] without touching the page when there is no transcript button', async () => {
    document.querySelector('ytd-video-description-transcript-section-renderer')!.remove();
    const cues = await readTranscriptPanel(document, { timeoutMs: 80, closeDelayMs: 0 });
    expect(cues).toEqual([]);
    expect(closed).toBe(0);
    expect(document.documentElement.classList.contains(OFFSCREEN_CLASS)).toBe(false);
  });

  it('leaves a panel the user already opened alone', async () => {
    document.querySelector(PANEL)!.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
    const cues = await readTranscriptPanel(document, { timeoutMs: 200, closeDelayMs: 0 });
    expect(cues).toHaveLength(3);
    expect(opened).toBe(0);
    expect(closed).toBe(0);
  });
});
