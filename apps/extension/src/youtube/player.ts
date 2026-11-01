export type Range = [number, number];

/** Merge overlapping or near-adjacent (gap <= 1 s) ranges. */
export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = ranges
    .filter(([a, b]) => b >= a)
    .map(([a, b]) => [a, b] as Range)
    .sort((x, y) => x[0] - y[0]);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else out.push(r);
  }
  return out;
}

/** Fraction of [start, end] covered by the ranges. */
export function playedFraction(ranges: Range[], start: number, end: number): number {
  if (end <= start) return 0;
  let covered = 0;
  for (const [a, b] of mergeRanges(ranges)) {
    covered += Math.max(0, Math.min(b, end) - Math.max(a, start));
  }
  return covered / (end - start);
}

export type PlayerEvent =
  | { t: 'video'; videoId: string | null; title?: string }
  | { t: 'time'; time: number; playing: boolean }
  | { t: 'watched'; videoId: string; range: Range };

export type WatchOptions = {
  doc?: Document;
  win?: Window;
  flushMs?: number;
  pollMs?: number;
  timeThrottleMs?: number;
  now?: () => number;
};

export type PlayerHandle = {
  videoId(): string | null;
  currentTime(): number;
  seek(time: number, play?: boolean): void;
  pause(): void;
  /** Time events are only emitted while a panel is connected. */
  setPanelConnected(connected: boolean): void;
  /** Re-emit the current video (and time) e.g. when a panel attaches. */
  emitState(): void;
  stop(): void;
};

export function currentVideoId(loc: Location): string | null {
  if (loc.pathname !== '/watch') return null;
  return new URLSearchParams(loc.search).get('v');
}

export function watchVideo(onEvent: (e: PlayerEvent) => void, opts: WatchOptions = {}): PlayerHandle {
  const doc = opts.doc ?? document;
  const win = opts.win ?? window;
  const flushMs = opts.flushMs ?? 10_000;
  const pollMs = opts.pollMs ?? 1000;
  const throttle = opts.timeThrottleMs ?? 500;
  const now = opts.now ?? (() => Date.now());

  const getVideo = () =>
    (doc.querySelector('video.html5-main-video') ?? doc.querySelector('video')) as HTMLVideoElement | null;

  let vid: string | null = null;
  let panel = false;
  let lastTimeEmit = -Infinity;
  let done: Range[] = [];
  let cur: Range | null = null;
  let boundVideo: HTMLVideoElement | null = null;

  const title = () => doc.title.replace(/\s*-\s*YouTube\s*$/, '') || undefined;

  const flush = () => {
    if (vid) {
      const all = [...done, ...(cur ? [cur] : [])];
      for (const r of mergeRanges(all)) if (r[1] > r[0]) onEvent({ t: 'watched', videoId: vid, range: r });
    }
    done = [];
    if (cur) cur = [cur[1], cur[1]];
  };

  const emitTime = (force = false) => {
    const v = getVideo();
    if (!panel || !v) return;
    const t = now();
    if (!force && t - lastTimeEmit < throttle) return;
    lastTimeEmit = t;
    onEvent({ t: 'time', time: v.currentTime, playing: !v.paused && !v.ended });
  };

  const onTimeUpdate = () => {
    if (currentVideoId(win.location) !== vid) check(); // never credit the old video
    const v = boundVideo;
    if (v && vid && !v.paused) {
      const t = v.currentTime;
      if (cur && t >= cur[1] && t - cur[1] <= 2) cur[1] = t;
      else {
        if (cur && cur[1] > cur[0]) done.push(cur);
        cur = [t, t];
      }
    }
    emitTime();
  };
  const onSeeking = () => {
    if (cur && cur[1] > cur[0]) done.push(cur);
    cur = null;
  };
  const onPlayState = () => emitTime(true);

  const bind = () => {
    const v = getVideo();
    if (v === boundVideo) return;
    if (boundVideo) unbind();
    boundVideo = v;
    if (!v) return;
    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('seeking', onSeeking);
    v.addEventListener('play', onPlayState);
    v.addEventListener('pause', onPlayState);
  };
  function unbind() {
    const v = boundVideo;
    if (!v) return;
    v.removeEventListener('timeupdate', onTimeUpdate);
    v.removeEventListener('seeking', onSeeking);
    v.removeEventListener('play', onPlayState);
    v.removeEventListener('pause', onPlayState);
    boundVideo = null;
  }

  const check = (force = false) => {
    const next = currentVideoId(win.location);
    if (!force && next === vid) {
      bind();
      return;
    }
    flush(); // old video's ranges first
    vid = next;
    done = [];
    cur = null;
    bind();
    onEvent({ t: 'video', videoId: vid, title: vid ? title() : undefined });
  };

  const onNav = () => check();
  const onPageHide = () => flush();
  doc.addEventListener('yt-navigate-finish', onNav);
  win.addEventListener('pagehide', onPageHide);
  const poll = setInterval(() => check(), pollMs);
  const flusher = setInterval(flush, flushMs);
  check(true);

  return {
    videoId: () => vid,
    currentTime: () => getVideo()?.currentTime ?? 0,
    seek(time, play) {
      const v = getVideo();
      if (!v) return;
      v.currentTime = time;
      if (play) void v.play()?.catch?.(() => {});
    },
    pause() {
      getVideo()?.pause();
    },
    setPanelConnected(c) {
      panel = c;
      if (c) emitTime(true);
    },
    emitState() {
      onEvent({ t: 'video', videoId: vid, title: vid ? title() : undefined });
      emitTime(true);
    },
    stop() {
      flush();
      clearInterval(poll);
      clearInterval(flusher);
      doc.removeEventListener('yt-navigate-finish', onNav);
      win.removeEventListener('pagehide', onPageHide);
      unbind();
    },
  };
}
