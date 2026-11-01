import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { VideoIndex } from '@mediamind/engine';
import type { VideoMeta } from '../../src/db/schema';
import type { SessionState } from '../../src/session/useVideoSession';
import { Header } from '../../src/ui/Header';
import { Tabs } from '../../src/ui/Tabs';
import { IndexCard, Mark, StickyNote, Timestamp, formatTime } from '../../src/ui/cards';
import { Panel } from '../../src/entrypoints/sidepanel/App';

const meta = (id: string, title = `Video ${id}`): VideoMeta => ({
  id,
  title,
  channel: 'Chan',
  duration: 600,
  lang: 'en',
  captionTrackKey: 'en|timedtext|',
  indexedAt: 1,
  lastOpenedAt: 1,
  watchedRanges: [],
});
const index = (searchMode: 'hybrid' | 'keyword'): VideoIndex => ({
  videoId: 'v1',
  lang: 'en',
  duration: 600,
  segments: [],
  embeddings: [],
  chapters: [],
  searchMode,
  suggestions: [],
});
const ready = (searchMode: 'hybrid' | 'keyword' = 'hybrid'): SessionState => ({
  s: 'ready',
  videoId: 'v1',
  meta: meta('v1'),
  index: index(searchMode),
  time: 0,
  playing: false,
});
const renderPanel = (state: SessionState, streak = 0, retry: () => void = () => {}) =>
  render(<Panel state={state} streak={streak} seek={() => {}} retry={retry} />);

const tabsCreate = vi.fn();
beforeEach(() => {
  tabsCreate.mockReset();
  (globalThis as any).chrome = { tabs: { create: tabsCreate } };
});
afterEach(() => {
  cleanup();
  delete (globalThis as any).chrome;
});

describe('Header', () => {
  it('shows the streak pill for a positive streak', () => {
    render(<Header streak={5} />);
    expect(screen.getByText('🔥 5-day streak')).toBeTruthy();
    expect(screen.getByText('MediaMind')).toBeTruthy();
  });
  it('hides the streak pill at 0', () => {
    render(<Header streak={0} />);
    expect(screen.queryByText(/day streak/)).toBeNull();
  });
  it('uses the brain mark as the logo', () => {
    const { container } = render(<Header streak={0} />);
    const logo = container.querySelector('.mm-logo svg');
    expect(logo?.getAttribute('width')).toBe('22');
  });
});

describe('Timestamp', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3723)).toBe('1:02:03');
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(59.9)).toBe('0:59');
  });
  it('renders a monospace chip and seeks on click', () => {
    const onClick = vi.fn();
    render(<Timestamp t={3723} onClick={onClick} />);
    const chip = screen.getByText('1:02:03');
    expect(chip.className).toContain('mm-ts');
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledWith(3723);
  });
});

describe('index-card primitives', () => {
  it('IndexCard renders label, timestamp and state classes', () => {
    const { container } = render(
      <IndexCard label="CH. 3 · NOW" tilted taped done ts={700}>
        Backpropagation
      </IndexCard>,
    );
    const card = container.querySelector('.mm-card')!;
    expect(card.classList.contains('is-tilted')).toBe(true);
    expect(card.classList.contains('is-done')).toBe(true);
    expect(container.querySelector('.mm-tape')).toBeTruthy();
    expect(screen.getByText('CH. 3 · NOW')).toBeTruthy();
    expect(screen.getByText('11:40')).toBeTruthy();
  });
  it('StickyNote shows its timestamp on top', () => {
    const { container } = render(<StickyNote ts={767}>Backprop = chain rule</StickyNote>);
    expect(container.querySelector('.mm-sticky')).toBeTruthy();
    expect(screen.getByText('12:47')).toBeTruthy();
  });
  it('Mark is a highlighter mark', () => {
    const { container } = render(<Mark>chain rule</Mark>);
    expect(container.querySelector('mark.mm-mark')?.textContent).toBe('chain rule');
  });
});

describe('Tabs', () => {
  it('renders the five tabs and reports changes', () => {
    const onChange = vi.fn();
    render(<Tabs value="ask" onChange={onChange} />);
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Ask', 'Chapters', 'Notes', 'Cards', 'Map']);
    expect(screen.getByRole('tab', { name: 'Ask' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Map' }));
    expect(onChange).toHaveBeenCalledWith('map');
  });
});

describe('Panel empty states', () => {
  it('no video: prompt plus the last 3 recent videos, which open in a new tab', () => {
    renderPanel({ s: 'no-video', recent: ['a', 'b', 'c', 'd'].map((id) => meta(id)) });
    expect(screen.getByText('Open a YouTube video to start')).toBeTruthy();
    expect(screen.getByText('Recent')).toBeTruthy();
    expect(screen.getByText('Video a')).toBeTruthy();
    expect(screen.getByText('Video c')).toBeTruthy();
    expect(screen.queryByText('Video d')).toBeNull();
    fireEvent.click(screen.getByText('Video b'));
    expect(tabsCreate).toHaveBeenCalledWith({ url: 'https://www.youtube.com/watch?v=b' });
  });
  it('no video with no history hides the Recent list', () => {
    renderPanel({ s: 'no-video', recent: [] });
    expect(screen.getByText('Open a YouTube video to start')).toBeTruthy();
    expect(screen.queryByText('Recent')).toBeNull();
  });
  it.each([
    ['captions', 'Reading transcript…'],
    ['segmenting', 'Reading transcript…'],
    ['embedding', 'Understanding the video…'],
    ['chapters', 'Finding chapters…'],
    ['done', 'Finding chapters…'],
  ] as const)('loading stage %s shows "%s" with a progress bar', (stage, copy) => {
    renderPanel({ s: 'loading', videoId: 'v1', stage, fraction: 0.5 });
    expect(screen.getByText(copy)).toBeTruthy();
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });
  it('loading progress never goes backwards when the embedding stage is skipped', () => {
    const value = (stage: any, fraction: number) => {
      const { unmount } = renderPanel({ s: 'loading', videoId: 'v1', stage, fraction });
      const v = Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'));
      unmount();
      return v;
    };
    const seq = [value('captions', 0), value('segmenting', 1), value('chapters', 0), value('chapters', 1), value('done', 1)];
    expect([...seq].sort((a, b) => a - b)).toEqual(seq);
    expect(seq[seq.length - 1]).toBe(100);
  });
  it('no captions', () => {
    renderPanel({ s: 'no-captions', videoId: 'v1', title: 'Some talk' });
    expect(screen.getByText("This video has no captions, so MediaMind can't read it yet.")).toBeTruthy();
  });
  it('caption error: honest copy and a Retry button', () => {
    const retry = vi.fn();
    renderPanel({ s: 'caption-error', videoId: 'v1', title: 'Some talk', detail: 'no timedtext captured' }, 0, retry);
    expect(screen.getByText("Couldn't read this video's captions")).toBeTruthy();
    expect(screen.getByText("YouTube didn't hand them over this time.")).toBeTruthy();
    expect(screen.queryByText(/has no captions/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it('shows the streak in the header on every state', () => {
    renderPanel({ s: 'no-captions', videoId: 'v1', title: 'x' }, 3);
    expect(screen.getByText('🔥 3-day streak')).toBeTruthy();
  });
});

describe('Panel tabs when ready', () => {
  it('keyword mode shows the basic-search banner on Ask only', () => {
    renderPanel(ready('keyword'));
    expect(screen.getByText('Basic search for this language — exact words only.')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Chapters' }));
    expect(screen.queryByText(/Basic search/)).toBeNull();
  });
  it('hybrid mode has no banner', () => {
    renderPanel(ready('hybrid'));
    expect(screen.queryByText(/Basic search/)).toBeNull();
  });
  it('Cards and Map tabs show coming-soon index cards', () => {
    renderPanel(ready());
    fireEvent.click(screen.getByRole('tab', { name: 'Cards' }));
    expect(screen.getByText('Coming soon — flashcards with spaced repetition')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Map' }));
    expect(screen.getByText('Coming soon — a mind map of this video')).toBeTruthy();
    expect(screen.queryByText(/flashcards with spaced/)).toBeNull();
  });
});
