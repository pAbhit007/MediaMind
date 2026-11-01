import { describe, expect, it } from 'vitest';
import { isPageToBackground, isPageToPanel, PANEL_PORT } from '../src/messaging';

describe('messaging guards', () => {
  it('port name', () => expect(PANEL_PORT).toBe('mm-panel'));
  it('isPageToPanel', () => {
    for (const t of ['video', 'time', 'captions', 'newNote']) expect(isPageToPanel({ t })).toBe(true);
    for (const m of [{ t: 'watched' }, { t: 'seek' }, null, undefined, 'x', {}]) expect(isPageToPanel(m)).toBe(false);
  });
  it('isPageToBackground', () => {
    expect(isPageToBackground({ t: 'watched', videoId: 'v', range: [0, 1] })).toBe(true);
    expect(isPageToBackground({ t: 'hello' })).toBe(true);
    expect(isPageToBackground({ t: 'time' })).toBe(false);
    expect(isPageToBackground(null)).toBe(false);
  });
});
