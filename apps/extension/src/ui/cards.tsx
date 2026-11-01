import React from 'react';

/** Seconds → `m:ss` under an hour, `h:mm:ss` from an hour on (floored). */
export function formatTime(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

/** Monospace amber chip; a button when it can seek. */
export function Timestamp({ t, onClick, className }: { t: number; onClick?: (t: number) => void; className?: string }) {
  const text = formatTime(t);
  if (!onClick) return <span className={cx('mm-ts', className)}>{text}</span>;
  return (
    <button type="button" className={cx('mm-ts', 'is-link', className)} onClick={() => onClick(t)} title={`Jump to ${text}`}>
      {text}
    </button>
  );
}

/** Underline-gradient highlighter. */
export const Mark = ({ children }: { children: React.ReactNode }) => <mark className="mm-mark">{children}</mark>;

type IndexCardProps = {
  /** Small rust label in the header strip, e.g. "CH. 3 · NOW". */
  label?: React.ReactNode;
  /** Current chapter: tilted -1.2deg. */
  tilted?: boolean;
  /** Strip of marigold tape across the top. */
  taped?: boolean;
  /** Watched: ✓ after the title. */
  done?: boolean;
  /** Timestamp printed top-right. */
  ts?: number;
  onSeek?: (t: number) => void;
  className?: string;
  children?: React.ReactNode;
};

/** Ruled index card with a red margin line (inner-cards-v1 option A). */
export function IndexCard({ label, tilted, taped, done, ts, onSeek, className, children }: IndexCardProps) {
  return (
    <div className={cx('mm-card', tilted && 'is-tilted', done && 'is-done', className)}>
      {taped && <span className="mm-tape" aria-hidden="true" />}
      {ts != null && <Timestamp t={ts} onClick={onSeek} className="mm-card-ts" />}
      <div className="mm-card-label">{label}</div>
      {children}
    </div>
  );
}

/** Card title line (bold serif, sits on the ruling); gets the ✓ when the card is done. */
export const CardTitle = ({ children }: { children: React.ReactNode }) => <div className="mm-card-title">{children}</div>;

/** Handwritten line (keywords, asides). */
export const Hand = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cx('mm-hand', className)}>{children}</div>
);

/** Yellow sticky note in handwriting, timestamp on top. */
export function StickyNote({ ts, onSeek, children }: { ts: number; onSeek?: (t: number) => void; children: React.ReactNode }) {
  return (
    <div className="mm-sticky">
      <Timestamp t={ts} onClick={onSeek} className="mm-sticky-ts" />
      {children}
    </div>
  );
}
