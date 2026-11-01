import React from 'react';

/** The brain mark from public/icon.svg (stroke thickened for small sizes). */
export function BrainLogo({ size = 22 }: { size?: number }) {
  return (
    <span className="mm-logo" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width={size} height={size}>
        <rect width="128" height="128" rx="28" fill="#FFFFFF" />
        <g fill="none" stroke="#2E2E30" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M61 30C50 22 34 26 32 40C21 43 18 57 26 64C18 72 22 88 34 90C38 102 54 104 61 96Z" />
          <path d="M67 30C78 22 94 26 96 40C107 43 110 57 102 64C110 72 106 88 94 90C90 102 74 104 67 96Z" />
          <path d="M44 48C50 50 52 56 49 62" />
          <path d="M40 77C46 72 53 74 55 80" />
          <path d="M84 48C78 50 76 56 79 62" />
          <path d="M88 77C82 72 75 74 73 80" />
        </g>
      </svg>
    </span>
  );
}

/** Panel header: brain tile, title, and the streak pill (hidden at 0). */
export function Header({ streak, title = 'MediaMind', right }: { streak?: number; title?: string; right?: React.ReactNode }) {
  return (
    <header className="mm-hd">
      <BrainLogo />
      <b className="mm-hd-title">{title}</b>
      {right}
      {!right && streak != null && streak > 0 && <span className="mm-streak">🔥 {streak}-day streak</span>}
    </header>
  );
}
