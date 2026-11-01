import React, { useEffect, useState } from 'react';
import { keyPoints, type Chapter, type Segment, type VideoIndex } from '@mediamind/engine';
import type { VideoMeta } from '../../db/schema';
import * as repo from '../../db/repo';
import { playedFraction } from '../../youtube/player';
import { CardTitle, Hand, IndexCard, Timestamp } from '../../ui/cards';

export const WATCHED_AT = 0.8;
export const META_REFRESH_MS = 10_000;
const VIEW_KEY = 'mm.chapters.view';

type View = 'grid' | 'list';
const loadView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
};
const storeView = (v: View) => {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* storage blocked: keep it for this session only */
  }
};

/** The chapter containing `time` (the last one once past its start). */
export function currentChapter(chapters: Chapter[], time: number): Chapter | undefined {
  let cur: Chapter | undefined;
  for (const c of chapters) if (time >= c.start) cur = c;
  return cur ?? chapters[0];
}

function chapterKeyPoints(ch: Chapter, index: VideoIndex): Segment[] {
  const usable = index.searchMode === 'hybrid' && index.embeddings.length === index.segments.length;
  if (usable) return keyPoints(ch, index.segments, index.embeddings, 3);
  return index.segments.filter((s) => s.start >= ch.start && s.start < ch.end).slice(0, 3);
}

type Props = {
  meta: VideoMeta;
  index: VideoIndex;
  time: number;
  seek: (t: number) => void;
  onOpenTranscript: (t: number) => void;
};

export function ChaptersTab({ meta: metaProp, index, time, seek, onOpenTranscript }: Props) {
  const [meta, setMeta] = useState(metaProp);
  const [view, setView] = useState<View>(loadView);
  useEffect(() => setMeta(metaProp), [metaProp]);
  useEffect(() => {
    const id = setInterval(() => {
      repo.getVideo(metaProp.id).then(
        (m) => m && setMeta(m),
        () => {},
      );
    }, META_REFRESH_MS);
    return () => clearInterval(id);
  }, [metaProp.id]);

  const pick = (v: View) => {
    setView(v);
    storeView(v);
  };
  const chapters = index.chapters;
  const duration = meta.duration || index.duration;
  const pct = Math.round(playedFraction(meta.watchedRanges, 0, duration) * 100);
  const cur = currentChapter(chapters, time);
  const points = cur ? chapterKeyPoints(cur, index) : [];

  return (
    <div className="mm-chapters">
      <div className="mm-lb">
        <span>
          {chapters.length} chapters · {pct}% watched
        </span>
        <span className="mm-view">
          <button type="button" aria-pressed={view === 'grid'} onClick={() => pick('grid')}>
            Grid ▦
          </button>
          {' / '}
          <button type="button" aria-pressed={view === 'list'} onClick={() => pick('list')}>
            List ☰
          </button>
        </span>
      </div>
      <div className={view === 'grid' ? 'mm-chg' : 'mm-chg is-list'}>
        {chapters.map((c, i) => {
          const isCur = c === cur;
          return (
            <button
              key={c.idx}
              type="button"
              className="mm-ch"
              data-testid="chapter"
              onClick={() => seek(c.start)}
              aria-label={`Chapter ${i + 1}: ${c.title}`}
            >
              <IndexCard
                label={`CH. ${i + 1}${isCur ? ' · NOW' : ''}`}
                tilted={isCur}
                taped={isCur}
                done={playedFraction(meta.watchedRanges, c.start, c.end) >= WATCHED_AT}
                ts={c.start}
              >
                <CardTitle>{c.title}</CardTitle>
                {c.keywords.length > 0 && <Hand>{c.keywords.join(', ')}</Hand>}
              </IndexCard>
            </button>
          );
        })}
      </div>
      {cur && (
        <>
          <div className="mm-lb">
            <span>Now playing — key points</span>
            <button type="button" className="mm-link" onClick={() => onOpenTranscript(cur.start)}>
              Transcript
            </button>
          </div>
          <ul className="mm-points">
            {points.map((s) => (
              <li key={s.idx}>
                <Timestamp t={s.start} onClick={seek} /> {s.text}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
