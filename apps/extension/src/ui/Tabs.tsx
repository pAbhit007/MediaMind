import React from 'react';

export type TabId = 'ask' | 'chapters' | 'notes' | 'cards' | 'map';

export const TABS: { id: TabId; label: string }[] = [
  { id: 'ask', label: 'Ask' },
  { id: 'chapters', label: 'Chapters' },
  { id: 'notes', label: 'Notes' },
  { id: 'cards', label: 'Cards' },
  { id: 'map', label: 'Map' },
];

export function Tabs({ value, onChange }: { value: TabId; onChange: (t: TabId) => void }) {
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = TABS.findIndex((t) => t.id === value);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    onChange(next.id);
    (e.currentTarget.querySelector(`#mm-tab-${next.id}`) as HTMLElement | null)?.focus();
  };
  return (
    <nav className="mm-tabs" role="tablist" aria-label="MediaMind sections" onKeyDown={onKey}>
      {TABS.map((t) => (
        <button
          key={t.id}
          id={`mm-tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          aria-controls="mm-tabpanel"
          tabIndex={t.id === value ? 0 : -1}
          className={t.id === value ? 'mm-tab is-on' : 'mm-tab'}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
