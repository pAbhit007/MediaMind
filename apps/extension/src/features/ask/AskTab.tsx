import React, { useEffect, useRef, useState } from 'react';
import type { Hit, VideoIndex } from '@mediamind/engine';
import * as repo from '../../db/repo';
import { CardTitle, IndexCard, Mark, Timestamp } from '../../ui/cards';
import { KeywordModeBanner } from '../../ui/EmptyStates';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Wraps every occurrence of the matched terms (case-insensitive) in <Mark>. */
export function highlightTerms(text: string, terms: string[]): React.ReactNode {
  const t = terms.filter((x) => x.trim()).sort((a, b) => b.length - a.length);
  if (!t.length) return text;
  const re = new RegExp(`(${t.map(escapeRe).join('|')})`, 'giu');
  return text.split(re).map((part, i) => (i % 2 ? <Mark key={i}>{part}</Mark> : part));
}

export const isTyping = (el: EventTarget | null) => {
  const e = el as HTMLElement | null;
  return !!e && (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' || e.isContentEditable);
};

type Props = {
  videoId: string;
  index: VideoIndex;
  duration: number;
  ask: (q: string) => Promise<Hit[]>;
  seek: (t: number) => void;
};

export function AskTab({ videoId, index, duration, ask, seek }: Props) {
  const [q, setQ] = useState('');
  const [result, setResult] = useState<{ q: string; hits: Hit[] } | null>(null);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const run = async (question: string) => {
    const query = question.trim();
    if (!query) return;
    const my = ++seq.current;
    try {
      const hits = await ask(query); // ask() logs the 'ask' activity itself
      if (my !== seq.current) return;
      setResult({ q: query, hits: hits.slice(0, 3) });
      setSaved(new Set());
    } catch (e) {
      console.error('MediaMind: ask failed', e);
    }
  };

  const saveNote = async (h: Hit, query: string) => {
    await repo.addNote({ videoId, kind: 'ask', t: h.start, quote: h.text, text: query });
    setSaved((s) => new Set(s).add(h.segmentIdx));
    await repo.logActivity('note').catch(() => {});
  };

  const chips = index.suggestions.slice(0, 3);
  return (
    <div className="mm-ask">
      {index.searchMode === 'keyword' && <KeywordModeBanner />}
      <form
        className="mm-ask-box"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void run(q);
        }}
      >
        <span aria-hidden="true">🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask this video…"
          aria-label="Ask this video"
        />
      </form>

      {result && result.hits.length === 0 && (
        <IndexCard label="NO MATCH" className="mm-empty">
          <CardTitle>No moment in this video matches that. Try other words.</CardTitle>
        </IndexCard>
      )}
      {result && result.hits.length > 0 && (
        <>
          <div className="mm-lb">
            <span>
              {result.hits.length} {result.hits.length === 1 ? 'moment answers' : 'moments answer'} this
            </span>
          </div>
          {result.hits.map((h, i) => (
            <div
              key={h.segmentIdx}
              className="mm-hit"
              role="button"
              tabIndex={0}
              data-testid="hit"
              onClick={() => seek(h.start)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  seek(h.start);
                }
              }}
            >
              <div className="mm-hit-top">
                <Timestamp t={h.start} />
                {i === 0 && <span>best match</span>}
              </div>
              <div className="mm-hit-text">{highlightTerms(h.text, h.matchedTerms)}</div>
              <button
                type="button"
                className="mm-link"
                disabled={saved.has(h.segmentIdx)}
                onClick={(e) => {
                  e.stopPropagation();
                  void saveNote(h, result.q);
                }}
              >
                {saved.has(h.segmentIdx) ? 'Saved ✓' : '＋ Save as note'}
              </button>
            </div>
          ))}
        </>
      )}

      {chips.length > 0 && (
        <>
          <div className="mm-lb">
            <span>Try asking</span>
          </div>
          <div className="mm-chips">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                className="mm-chip"
                onClick={() => {
                  setQ(c);
                  void run(c);
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="mm-ft">● on-device · {Math.max(1, Math.round(duration / 60))}-min video indexed</div>
    </div>
  );
}
