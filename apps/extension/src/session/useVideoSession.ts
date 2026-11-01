import { useCallback, useEffect, useRef, useState } from 'react';
import type { Hit, IndexStage, VideoIndex } from '@mediamind/engine';
import { PANEL_PORT, type PageToPanel, type PanelToPage } from '../messaging';
import type { CaptionResult } from '../youtube/captions';
import type { VideoMeta } from '../db/schema';
import * as repo from '../db/repo';
import { askInWorker, indexInWorker, loadInWorker } from '../worker/client';

export type SessionState =
  | { s: 'no-video'; recent: VideoMeta[] }
  | { s: 'loading'; videoId: string; stage: IndexStage | 'captions'; fraction: number }
  | { s: 'no-captions'; videoId: string; title: string }
  /** Captions exist (or might) but we couldn't read them / index them this time. */
  | { s: 'caption-error'; videoId: string; title: string; detail?: string }
  | { s: 'ready'; videoId: string; meta: VideoMeta; index: VideoIndex; time: number; playing: boolean };

type OkResult = Extract<CaptionResult, { kind: 'ok' }>;

export const captionTrackKey = (r: OkResult) => `${r.lang}|${r.via}|${r.translatedCues ? 'tlang-en' : ''}`;

/** How long a retry waits for the page to answer before showing caption-error again. */
export const RETRY_REPLY_MS = 25000;

const isAbort = (e: unknown) => (e as { name?: string })?.name === 'AbortError';

type PortLike = {
  postMessage(m: unknown): void;
  onMessage: { addListener(f: (m: any) => void): void };
  onDisconnect: { addListener(f: () => void): void };
  disconnect?(): void;
};

export function useVideoSession(): {
  state: SessionState;
  seek(t: number): void;
  pause(): void;
  ask(q: string): Promise<Hit[]>;
  /** Ask the page for captions again (after a caption-error). */
  retry(): void;
  /** Subscribe to the page's "new note at {time}" requests (Alt+N). Returns an unsubscribe. */
  onNewNote(fn: (time: number) => void): () => void;
} {
  const [state, setState] = useState<SessionState>({ s: 'no-video', recent: [] });
  const portRef = useRef<PortLike | null>(null);
  const videoRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const gotCaptionsRef = useRef(false);
  const lastTime = useRef({ time: 0, playing: false });
  const readyId = useRef<string | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const noteListeners = useRef(new Set<(time: number) => void>());

  const send = useCallback((m: PanelToPage) => {
    try {
      portRef.current?.postMessage(m);
    } catch {
      /* port is reconnecting */
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let backoff = 250;

    const showNoVideo = () => {
      videoRef.current = null;
      readyId.current = null;
      abortRef.current?.abort();
      abortRef.current = null;
      setState((p) => (p.s === 'no-video' ? p : { s: 'no-video', recent: [] }));
      repo.recentVideos(5).then(
        (recent) => {
          if (!disposed && videoRef.current === null) setState({ s: 'no-video', recent });
        },
        () => {},
      );
    };

    const onVideo = (m: Extract<PageToPanel, { t: 'video' }>) => {
      if (m.videoId == null) return showNoVideo();
      if (m.videoId === videoRef.current) {
        // Same video re-announced (e.g. after a reconnect): only retry if captions never arrived.
        if (!gotCaptionsRef.current) send({ t: 'getCaptions' });
        return;
      }
      abortRef.current?.abort(); // drop any in-flight indexing for the previous video
      abortRef.current = null;
      videoRef.current = m.videoId;
      readyId.current = null;
      gotCaptionsRef.current = false;
      lastTime.current = { time: 0, playing: false };
      setState({ s: 'loading', videoId: m.videoId, stage: 'captions', fraction: 0 });
      send({ t: 'getCaptions' });
    };

    const onCaptions = async (r: CaptionResult) => {
      const videoId = videoRef.current;
      if (!videoId || r.videoId !== videoId) return; // stale or foreign result
      gotCaptionsRef.current = true;
      clearTimeout(retryTimer.current);
      if (r.kind === 'none') {
        if (r.reason === 'no-captions') setState({ s: 'no-captions', videoId, title: r.title });
        else setState({ s: 'caption-error', videoId, title: r.title, ...(r.detail ? { detail: r.detail } : {}) });
        return;
      }
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      let stage: IndexStage | 'cache' = 'cache';
      const live = () => !ac.signal.aborted && !disposed && videoRef.current === videoId;
      const toReady = (meta: VideoMeta, index: VideoIndex) => {
        readyId.current = videoId;
        setState({ s: 'ready', videoId, meta, index, ...lastTime.current });
      };
      try {
        const key = captionTrackKey(r);
        const cached = await repo.loadIndex(videoId, key);
        if (!live()) return;
        if (cached) {
          await loadInWorker(cached);
          const meta = await repo.getVideo(videoId);
          if (!live() || !meta) return;
          return toReady(meta, cached);
        }
        stage = 'segmenting';
        setState({ s: 'loading', videoId, stage: 'segmenting', fraction: 0 });
        const handle = await indexInWorker(
          {
            videoId,
            duration: r.duration,
            lang: r.lang,
            cues: r.cues,
            translatedCues: r.translatedCues,
            creatorChapters: r.creatorChapters,
          },
          (st, fraction) => {
            stage = st;
            if (live()) setState({ s: 'loading', videoId, stage: st, fraction });
          },
          ac.signal,
        );
        if (!live()) return;
        stage = 'done';
        await repo.saveIndex(
          { id: videoId, title: r.title, channel: r.channel, duration: r.duration, lang: r.lang },
          handle.index,
          key,
        );
        const meta = await repo.getVideo(videoId);
        if (!live() || !meta) return;
        toReady(meta, handle.index);
      } catch (e) {
        if (isAbort(e) || !live()) return;
        console.error('MediaMind: indexing failed', stage, e);
        setState({ s: 'caption-error', videoId, title: r.title, detail: `indexing failed at ${stage}` });
      }
    };

    const onMessage = (m: PageToPanel) => {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'video') onVideo(m);
      else if (m.t === 'captions') void onCaptions(m.result);
      else if (m.t === 'time') {
        lastTime.current = { time: m.time, playing: m.playing };
        setState((p) =>
          p.s === 'ready' && (p.time !== m.time || p.playing !== m.playing) ? { ...p, time: m.time, playing: m.playing } : p,
        );
      } else if (m.t === 'newNote') {
        noteListeners.current.forEach((f) => f(m.time));
      }
    };

    const connect = () => {
      if (disposed) return;
      let port: PortLike;
      try {
        port = chrome.runtime.connect({ name: PANEL_PORT }) as unknown as PortLike;
      } catch {
        retry = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 5000);
        return;
      }
      portRef.current = port;
      port.onMessage.addListener(onMessage);
      port.onDisconnect.addListener(() => {
        if (portRef.current === port) portRef.current = null;
        if (disposed) return;
        retry = setTimeout(connect, backoff); // service worker suspended: reconnect
        backoff = Math.min(backoff * 2, 5000);
      });
      backoff = 250;
      // The router replays the tab's state ({t:'video'}) on every connect; the same-video
      // branch in onVideo re-requests captions if they never arrived.
      if (videoRef.current && !gotCaptionsRef.current) send({ t: 'getCaptions' });
    };

    showNoVideo();
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearTimeout(retryTimer.current);
      abortRef.current?.abort();
      const p = portRef.current;
      portRef.current = null;
      try {
        p?.disconnect?.();
      } catch {
        /* ignore */
      }
    };
  }, [send]);

  const retry = useCallback(() => {
    const videoId = videoRef.current;
    if (!videoId) return;
    abortRef.current?.abort();
    abortRef.current = null;
    readyId.current = null;
    gotCaptionsRef.current = false;
    setState({ s: 'loading', videoId, stage: 'captions', fraction: 0 });
    send({ t: 'getCaptions' });
    clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => {
      // No captions reply at all (page reloaded, content script gone): don't spin forever.
      if (videoRef.current !== videoId || gotCaptionsRef.current) return;
      gotCaptionsRef.current = true;
      setState({ s: 'caption-error', videoId, title: '', detail: 'no reply' });
    }, RETRY_REPLY_MS);
  }, [send]);
  const seek = useCallback((t: number) => send({ t: 'seek', time: t, play: true }), [send]);
  const pause = useCallback(() => send({ t: 'pause' }), [send]);
  const ask = useCallback(async (q: string): Promise<Hit[]> => {
    const id = readyId.current;
    if (!id) throw new Error('No video is ready');
    const hits = await askInWorker(id, q);
    void repo.logActivity('ask').catch(() => {});
    return hits;
  }, []);

  const onNewNote = useCallback((fn: (time: number) => void) => {
    noteListeners.current.add(fn);
    return () => void noteListeners.current.delete(fn);
  }, []);

  return { state, seek, pause, ask, retry, onNewNote };
}
