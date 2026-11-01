import React, { useEffect, useRef, useState } from 'react';
import type { Segment, VideoIndex } from '@mediamind/engine';
import * as repo from '../../db/repo';
import { formatTime } from '../../ui/cards';

/** Auto-scroll pauses for this long after the user scrolls the transcript. */
export const USER_SCROLL_HOLD_MS = 5000;

type Props = {
  videoId: string;
  index: VideoIndex;
  time: number;
  /** Scroll here first (e.g. the chapter the user came from). */
  startAt?: number;
  seek: (t: number) => void;
  onClose: () => void;
};

type Pending = { seg: Segment; quote: string; x: number; y: number };

export function TranscriptView({ videoId, index, time, startAt, seek, onClose }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const lastUserScroll = useRef(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const [flash, setFlash] = useState(false);

  const groups = index.chapters.length
    ? index.chapters.map((c) => ({ c, segs: index.segments.filter((s) => s.start >= c.start && s.start < c.end) }))
    : [{ c: null, segs: index.segments }];
  const nowIdx = index.segments.findIndex((s) => time >= s.start && time < s.end);

  const scrollTo = (sel: string) =>
    (boxRef.current?.querySelector(sel) as HTMLElement | null)?.scrollIntoView?.({ block: 'center' });

  useEffect(() => {
    if (startAt == null) return;
    const seg = index.segments.find((s) => s.start >= startAt) ?? index.segments[0];
    if (seg) scrollTo(`[data-idx="${seg.idx}"]`);
    lastUserScroll.current = Date.now(); // let the reader land on the chapter before following playback
  }, []);

  useEffect(() => {
    if (nowIdx < 0 || Date.now() - lastUserScroll.current < USER_SCROLL_HOLD_MS) return;
    scrollTo(`[data-idx="${index.segments[nowIdx].idx}"]`);
  }, [nowIdx, index.segments]);

  const markUserScroll = () => {
    lastUserScroll.current = Date.now();
  };

  const onMouseUp = () => {
    const sel = window.getSelection();
    const quote = sel?.toString().trim() ?? '';
    if (!sel || !quote || !sel.anchorNode) return setPending(null);
    const line = (sel.anchorNode.nodeType === 1 ? (sel.anchorNode as Element) : sel.anchorNode.parentElement)?.closest(
      '[data-idx]',
    );
    const seg = line && index.segments.find((s) => String(s.idx) === (line as HTMLElement).dataset.idx);
    if (!seg) return setPending(null);
    let x = 0;
    let y = 0;
    try {
      const r = sel.getRangeAt(0).getBoundingClientRect();
      const box = boxRef.current!.getBoundingClientRect();
      x = r.left - box.left + r.width / 2;
      y = r.top - box.top + boxRef.current!.scrollTop;
    } catch {
      /* no layout (tests) */
    }
    setPending({ seg, quote, x, y });
  };

  const saveHighlight = async () => {
    if (!pending) return;
    const { seg, quote } = pending;
    setPending(null);
    window.getSelection()?.removeAllRanges();
    await repo.addNote({ videoId, kind: 'highlight', t: seg.start, quote, text: '' });
    setFlash(true);
    setTimeout(() => setFlash(false), 1500);
    await repo.logActivity('highlight').catch(() => {});
  };

  return (
    <div className="mm-transcript">
      <div className="mm-lb">
        <button type="button" className="mm-link" onClick={onClose}>
          ← Back
        </button>
        <span>{flash ? 'Highlight saved to Notes ✓' : 'Transcript · select text to highlight'}</span>
      </div>
      <div
        className="mm-tr-box"
        ref={boxRef}
        onWheel={markUserScroll}
        onTouchMove={markUserScroll}
        onKeyDown={markUserScroll}
        onMouseUp={onMouseUp}
      >
        {groups.map(({ c, segs }, gi) => (
          <section key={c ? c.idx : gi}>
            {c && <h3 className="mm-tr-ch">{c.title}</h3>}
            {segs.map((s) => (
              <p
                key={s.idx}
                data-idx={s.idx}
                className={s.idx === index.segments[nowIdx]?.idx ? 'mm-tr-line is-now' : 'mm-tr-line'}
                onClick={() => {
                  if (window.getSelection()?.toString().trim()) return; // finishing a selection, not a jump
                  seek(s.start);
                }}
              >
                <span className="mm-tr-ts">{formatTime(s.start)}</span> {s.text}
              </p>
            ))}
          </section>
        ))}
        {pending && (
          <button
            type="button"
            className="mm-tr-hl"
            style={{ left: pending.x, top: pending.y }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void saveHighlight()}
          >
            Highlight
          </button>
        )}
      </div>
    </div>
  );
}
