import React from 'react';
import type { VideoMeta } from '../db/schema';
import type { SessionState } from '../session/useVideoSession';
import { CardTitle, Hand, IndexCard, formatTime } from './cards';

type LoadingStage = Extract<SessionState, { s: 'loading' }>['stage'];

const STAGE_COPY: Record<LoadingStage, string> = {
  captions: 'Reading transcript…',
  segmenting: 'Reading transcript…',
  embedding: 'Understanding the video…',
  chapters: 'Finding chapters…',
  done: 'Finding chapters…',
};

// Each stage owns a slice of the bar. Keyword mode never fires 'embedding', so the bar
// simply jumps over that slice — it never moves backwards.
const STAGE_SPAN: Record<LoadingStage, [number, number]> = {
  captions: [0, 0.05],
  segmenting: [0.05, 0.2],
  embedding: [0.2, 0.85],
  chapters: [0.85, 1],
  done: [1, 1],
};

export function overallProgress(stage: LoadingStage, fraction: number): number {
  const [a, b] = STAGE_SPAN[stage];
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  return a + (b - a) * f;
}

export const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

export function NoVideo({ recent }: { recent: VideoMeta[] }) {
  const last = recent.slice(0, 3);
  return (
    <IndexCard label="START HERE" className="mm-empty">
      <CardTitle>Open a YouTube video to start</CardTitle>
      <Hand>…then ask it anything, jump between chapters, take notes.</Hand>
      {last.length > 0 && (
        <>
          <div className="mm-card-sub">Recent</div>
          <ul className="mm-recent">
            {last.map((v) => (
              <li key={v.id}>
                <button type="button" onClick={() => void chrome.tabs.create({ url: watchUrl(v.id) })}>
                  <span className="mm-recent-title">{v.title || v.id}</span>
                  <span className="mm-recent-len">{formatTime(v.duration)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </IndexCard>
  );
}

export function Loading({ stage, fraction }: { stage: LoadingStage; fraction: number }) {
  const pct = Math.round(overallProgress(stage, fraction) * 100);
  return (
    <IndexCard label="INDEXING" className="mm-empty">
      <CardTitle>
        <span aria-live="polite">{STAGE_COPY[stage]}</span>
      </CardTitle>
      <div
        className="mm-progress"
        role="progressbar"
        aria-label="Indexing progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <i style={{ width: `${pct}%` }} />
      </div>
      <Hand>on your device — nothing leaves your browser</Hand>
    </IndexCard>
  );
}

export function NoCaptions({ title }: { title?: string }) {
  return (
    <IndexCard label="NO CAPTIONS" className="mm-empty">
      <CardTitle>This video has no captions, so MediaMind can't read it yet.</CardTitle>
      {title && <Hand>{title}</Hand>}
    </IndexCard>
  );
}

export function CaptionError({ title, onRetry }: { title?: string; onRetry: () => void }) {
  return (
    <IndexCard label="CAPTIONS" className="mm-empty">
      <CardTitle>Couldn't read this video's captions</CardTitle>
      <p className="mm-card-body">YouTube didn't hand them over this time.</p>
      {title && <Hand>{title}</Hand>}
      <button type="button" className="mm-retry" onClick={onRetry}>
        Retry
      </button>
    </IndexCard>
  );
}

export const KeywordModeBanner = () => (
  <div className="mm-banner" role="note">
    Basic search for this language — exact words only.
  </div>
);

const COMING: Record<'cards' | 'map', { label: string; copy: string }> = {
  cards: { label: 'FLASHCARDS', copy: 'Coming soon — flashcards with spaced repetition' },
  map: { label: 'MIND MAP', copy: 'Coming soon — a mind map of this video' },
};

export function ComingSoon({ tab }: { tab: 'cards' | 'map' }) {
  const c = COMING[tab];
  return (
    <IndexCard label={c.label} taped className="mm-empty">
      <CardTitle>{c.copy}</CardTitle>
    </IndexCard>
  );
}
