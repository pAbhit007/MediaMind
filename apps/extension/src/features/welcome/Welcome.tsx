import React, { useEffect, useState } from 'react';
import './welcome.css';

/** Spec §4.2 — order matters. */
export const GREETINGS: { text: string; lang: string }[] = [
  { text: 'नमस्ते', lang: 'Hindi' },
  { text: 'வணக்கம்', lang: 'Tamil' },
  { text: 'নমস্কার', lang: 'Bengali' },
  { text: 'నమస్కారం', lang: 'Telugu' },
  { text: 'नमस्कार', lang: 'Marathi' },
  { text: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ', lang: 'Punjabi' },
  { text: 'નમસ્તે', lang: 'Gujarati' },
  { text: 'ನಮಸ್ಕಾರ', lang: 'Kannada' },
  { text: 'നമസ്കാരം', lang: 'Malayalam' },
  { text: 'Hello', lang: 'English' },
];
export const GREETING_MS = 1200;
export const CONTINUE_MS = 2500;

const TORAN = 12;
const PETAL_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

export function Welcome({ onContinue, onSkip }: { onContinue: () => void; onSkip: () => void }) {
  const [reduced] = useState(prefersReducedMotion);
  const [tick, setTick] = useState(0);
  const [ready, setReady] = useState(reduced);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), GREETING_MS);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (reduced) return;
    const id = setTimeout(() => setReady(true), CONTINUE_MS);
    return () => clearTimeout(id);
  }, [reduced]);

  const i = tick % GREETINGS.length;
  const cur = GREETINGS[i];
  const prev = GREETINGS[(i + GREETINGS.length - 1) % GREETINGS.length];
  return (
    <div className={reduced ? 'wl is-reduced' : 'wl'}>
      <div className="wl-toran" aria-hidden="true">
        {Array.from({ length: TORAN }, (_, k) => (
          <i key={k} />
        ))}
      </div>
      <button type="button" className="wl-skip" onClick={onSkip}>
        Skip →
      </button>
      <div className="wl-main">
        <div className="wl-rangoli" aria-hidden="true">
          {PETAL_ANGLES.map((a) => (
            <span key={`o${a}`} className="wl-petal" style={{ transform: `rotate(${a}deg)` }} />
          ))}
          {PETAL_ANGLES.map((a) => (
            <span key={`i${a}`} className="wl-petal is-in" style={{ transform: `rotate(${a + 22.5}deg)` }} />
          ))}
          <div className="wl-ctr" />
        </div>
        <div className="wl-hello">
          {/* The outgoing greeting stays for its exit animation; there is none before the first tick. */}
          {tick > 0 && (
            <div key={`out-${tick}`} className="wl-g is-out" aria-hidden="true">
              <b>{prev.text}</b>
              <small>{prev.lang}</small>
            </div>
          )}
          <div key={`in-${tick}`} className="wl-g is-in" data-testid="greeting">
            <b lang={langCode(cur.lang)}>{cur.text}</b>
            <small>{cur.lang}</small>
          </div>
        </div>
        <div className="wl-tag">Turn any YouTube video into notes, chapters &amp; flashcards.</div>
        <div className="wl-tag2">Free forever · no account · nothing leaves your browser</div>
      </div>
      <button
        type="button"
        className={ready ? 'wl-cont is-ready' : 'wl-cont'}
        disabled={!ready}
        onClick={onContinue}
      >
        <span className="wl-fill" aria-hidden="true" />
        <span className="wl-cont-txt">Continue →</span>
      </button>
    </div>
  );
}

const LANG: Record<string, string> = {
  Hindi: 'hi', Tamil: 'ta', Bengali: 'bn', Telugu: 'te', Marathi: 'mr',
  Punjabi: 'pa', Gujarati: 'gu', Kannada: 'kn', Malayalam: 'ml', English: 'en',
};
const langCode = (name: string) => LANG[name];
