import 'fake-indexeddb/auto';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChaptersTab } from '../src/features/chapters/ChaptersTab';
import { makeIndex, makeMeta } from './fixtures/video';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const renderCh = (watchedRanges: [number, number][] = [], time = 250, seek = vi.fn(), onOpenTranscript = vi.fn()) =>
  render(
    <ChaptersTab
      meta={makeMeta({ watchedRanges })}
      index={makeIndex()}
      time={time}
      seek={seek}
      onOpenTranscript={onOpenTranscript}
    />,
  );
const cards = () => screen.getAllByTestId('chapter');

describe('ChaptersTab', () => {
  it('renders one card per chapter with title, label and keywords', () => {
    renderCh();
    expect(cards()).toHaveLength(3);
    expect(cards()[0].textContent).toContain('CH. 1');
    expect(cards()[0].textContent).toContain('What a neuron computes');
    expect(cards()[2].textContent).toContain('chain rule, error');
  });

  it('tilts and tapes the current chapter', () => {
    renderCh([], 250);
    const card = (i: number) => cards()[i].querySelector('.mm-card')!;
    expect(card(1).classList.contains('is-tilted')).toBe(true);
    expect(card(1).querySelector('.mm-tape')).toBeTruthy();
    expect(cards()[1].textContent).toContain('CH. 2 · NOW');
    expect(card(0).classList.contains('is-tilted')).toBe(false);
  });

  it('marks a chapter watched at 80% but not at 79%', () => {
    renderCh([[0, 160], [200, 358]]);
    const card = (i: number) => cards()[i].querySelector('.mm-card')!;
    expect(card(0).classList.contains('is-done')).toBe(true); // 160/200
    expect(card(1).classList.contains('is-done')).toBe(false); // 158/200
  });

  it('clicking a card seeks to the chapter start', () => {
    const seek = vi.fn();
    renderCh([], 0, seek);
    fireEvent.click(cards()[2]);
    expect(seek).toHaveBeenCalledWith(400);
  });

  it('watched % is computed over the whole duration', () => {
    renderCh([[0, 160], [200, 358]]);
    expect(screen.getByText('3 chapters · 53% watched')).toBeTruthy(); // 318 / 600
  });

  it('keyword mode key points are the first 3 segments of the current chapter', () => {
    renderCh([], 250);
    const items = document.querySelectorAll('.mm-points li');
    expect([...items].map((li) => li.textContent)).toEqual([
      '3:30 line 7 about topic 1',
      '4:00 line 8 about topic 1',
      '4:30 line 9 about topic 1',
    ]);
  });

  it('remembers the grid/list choice and opens the transcript at the current chapter', () => {
    const onOpen = vi.fn();
    renderCh([], 250, vi.fn(), onOpen);
    fireEvent.click(screen.getByRole('button', { name: 'List ☰' }));
    expect(localStorage.getItem('mm.chapters.view')).toBe('list');
    expect(document.querySelector('.mm-chg')!.classList.contains('is-list')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Transcript' }));
    expect(onOpen).toHaveBeenCalledWith(200);
  });
});
