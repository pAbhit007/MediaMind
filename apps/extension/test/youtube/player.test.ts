import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeRanges, playedFraction, watchVideo, type PlayerEvent } from '../../src/youtube/player';

describe('ranges', () => {
  it('merges overlaps and adjacent (gap <= 1s)', () => {
    expect(mergeRanges([[10, 20], [0, 5], [5.8, 8], [19, 30]])).toEqual([[0, 8], [10, 30]]);
    expect(mergeRanges([[0, 5], [7, 9]])).toEqual([[0, 5], [7, 9]]);
  });
  it('playedFraction', () => {
    expect(playedFraction([[0, 50], [60, 100]], 0, 100)).toBe(0.9);
    expect(playedFraction([], 0, 100)).toBe(0);
    expect(playedFraction([[0, 10]], 5, 5)).toBe(0);
  });
});

describe('watchVideo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<video class="html5-main-video"></video>';
  });
  afterEach(() => {
    vi.useRealTimers();
    history.replaceState(null, '', '/');
  });

  it('emits video null on non-watch pages', () => {
    history.replaceState(null, '', '/feed/subscriptions');
    const ev: PlayerEvent[] = [];
    const h = watchVideo((e) => ev.push(e));
    expect(ev[0]).toEqual({ t: 'video', videoId: null, title: undefined });
    h.stop();
  });

  it('emits new videoId on yt-navigate-finish and flushes the old video first', () => {
    history.replaceState(null, '', '/watch?v=aaa');
    const ev: PlayerEvent[] = [];
    const h = watchVideo((e) => ev.push(e));
    const v = document.querySelector('video')!;
    Object.defineProperty(v, 'paused', { value: false, configurable: true });
    for (const t of [1, 2, 3]) {
      Object.defineProperty(v, 'currentTime', { value: t, configurable: true });
      v.dispatchEvent(new Event('timeupdate'));
    }
    history.replaceState(null, '', '/watch?v=bbb');
    document.dispatchEvent(new Event('yt-navigate-finish'));
    const kinds = ev.map((e) => e.t);
    expect(kinds).toEqual(['video', 'watched', 'video']);
    expect(ev[1]).toMatchObject({ videoId: 'aaa', range: [1, 3] });
    expect(ev[2]).toMatchObject({ videoId: 'bbb' });
    h.stop();
  });

  it('falls back to URL polling', () => {
    history.replaceState(null, '', '/watch?v=aaa');
    const ev: PlayerEvent[] = [];
    const h = watchVideo((e) => ev.push(e));
    history.replaceState(null, '', '/watch?v=ccc');
    vi.advanceTimersByTime(1000);
    expect(ev.filter((e) => e.t === 'video').pop()).toMatchObject({ videoId: 'ccc' });
    h.stop();
  });

  it('throttles time to 2/s and only with a panel', () => {
    history.replaceState(null, '', '/watch?v=aaa');
    let n = 0;
    const clock = { t: 0 };
    const ev: PlayerEvent[] = [];
    const h = watchVideo((e) => ev.push(e), { now: () => clock.t });
    const v = document.querySelector('video')!;
    const tick = () => v.dispatchEvent(new Event('timeupdate'));
    tick();
    expect(ev.some((e) => e.t === 'time')).toBe(false);
    h.setPanelConnected(true);
    const base = ev.filter((e) => e.t === 'time').length;
    for (let i = 0; i < 10; i++) {
      clock.t += 100;
      tick();
      n++;
    }
    expect(ev.filter((e) => e.t === 'time').length - base).toBe(2);
    h.stop();
  });

  it('flushes watched ranges every 10s', () => {
    history.replaceState(null, '', '/watch?v=aaa');
    const ev: PlayerEvent[] = [];
    const h = watchVideo((e) => ev.push(e));
    const v = document.querySelector('video')!;
    Object.defineProperty(v, 'paused', { value: false, configurable: true });
    Object.defineProperty(v, 'currentTime', { value: 4, configurable: true });
    v.dispatchEvent(new Event('timeupdate'));
    Object.defineProperty(v, 'currentTime', { value: 5, configurable: true });
    v.dispatchEvent(new Event('timeupdate'));
    vi.advanceTimersByTime(10_000);
    expect(ev.find((e) => e.t === 'watched')).toMatchObject({ range: [4, 5] });
    h.stop();
  });

  it('does not credit playback to the old video after a URL change', () => {
    history.replaceState(null, '', '/watch?v=aaa');
    const ev: PlayerEvent[] = [];
    const h = watchVideo((e) => ev.push(e));
    const v = document.querySelector('video')!;
    Object.defineProperty(v, 'paused', { value: false, configurable: true });
    const at = (t: number) => {
      Object.defineProperty(v, 'currentTime', { value: t, configurable: true });
      v.dispatchEvent(new Event('timeupdate'));
    };
    at(10);
    at(11);
    history.replaceState(null, '', '/watch?v=bbb');
    at(0);
    at(1);
    h.stop();
    const w = ev.filter((e) => e.t === 'watched') as any[];
    expect(w[0]).toMatchObject({ videoId: 'aaa', range: [10, 11] });
    expect(w[1]).toMatchObject({ videoId: 'bbb', range: [0, 1] });
    expect(w).toHaveLength(2);
  });
});
