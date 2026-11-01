import 'fake-indexeddb/auto';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Hit } from '@mediamind/engine';
import { AskTab } from '../src/features/ask/AskTab';
import { db } from '../src/db/schema';
import { makeIndex } from './fixtures/video';

const hits: Hit[] = [
  { segmentIdx: 4, start: 724, end: 754, text: 'so backpropagation is just the chain rule', score: 0.9, matchedTerms: ['backpropagation'] },
  { segmentIdx: 5, start: 871, end: 901, text: 'each weight contributed to the error', score: 0.7, matchedTerms: [] },
  { segmentIdx: 9, start: 1670, end: 1700, text: 'recap: assigns blame', score: 0.5, matchedTerms: [] },
];

let ask: ReturnType<typeof vi.fn>;
let seek: ReturnType<typeof vi.fn>;
const renderAsk = (index = makeIndex()) =>
  render(<AskTab videoId="v1" index={index} duration={2400} ask={ask as any} seek={seek as any} />);
const submit = (q: string) => {
  const input = screen.getByPlaceholderText('Ask this video…');
  fireEvent.change(input, { target: { value: q } });
  fireEvent.submit(input.closest('form')!);
};

beforeEach(async () => {
  ask = vi.fn(async () => hits);
  seek = vi.fn();
  await db.notes.clear();
  await db.activity.clear();
});
afterEach(cleanup);

describe('AskTab', () => {
  it('renders up to 3 hits, the first labelled best match', async () => {
    renderAsk();
    submit('what is backprop');
    const cards = await screen.findAllByTestId('hit');
    expect(cards).toHaveLength(3);
    expect(cards[0].textContent).toContain('best match');
    expect(cards[1].textContent).not.toContain('best match');
    expect(ask).toHaveBeenCalledWith('what is backprop');
    expect(screen.getByText('● on-device · 40-min video indexed')).toBeTruthy();
  });

  it('highlights matched terms', async () => {
    renderAsk();
    submit('backprop');
    await screen.findAllByTestId('hit');
    const marks = document.querySelectorAll('mark.mm-mark');
    expect([...marks].map((m) => m.textContent)).toEqual(['backpropagation']);
  });

  it('clicking a card seeks to its start', async () => {
    renderAsk();
    submit('backprop');
    fireEvent.click((await screen.findAllByTestId('hit'))[1]);
    expect(seek).toHaveBeenCalledWith(871);
  });

  it('save as note writes an ask note and logs a note activity (ask is not double-logged)', async () => {
    renderAsk();
    submit('what is backprop');
    await screen.findAllByTestId('hit');
    fireEvent.click(screen.getAllByRole('button', { name: '＋ Save as note' })[0]);
    await screen.findByText('Saved ✓');
    await waitFor(async () => expect((await db.activity.toArray())[0]?.note).toBe(1));
    const notes = await db.notes.toArray();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ videoId: 'v1', kind: 'ask', t: 724, quote: hits[0].text, text: 'what is backprop' });
    expect((await db.activity.toArray())[0].ask).toBe(0);
    expect(seek).not.toHaveBeenCalled();
  });

  it('shows the no-match card for empty results', async () => {
    ask = vi.fn(async () => []);
    renderAsk();
    submit('quantum');
    await screen.findByText('No moment in this video matches that. Try other words.');
  });

  it('suggestion chips ask their question', async () => {
    renderAsk();
    fireEvent.click(screen.getByRole('button', { name: 'Why use ReLU?' }));
    expect(ask).toHaveBeenCalledWith('Why use ReLU?');
    await screen.findAllByTestId('hit');
  });

  it('/ focuses the input', () => {
    renderAsk();
    fireEvent.keyDown(document.body, { key: '/' });
    expect(document.activeElement).toBe(screen.getByPlaceholderText('Ask this video…'));
  });

  it('keyword mode shows the basic-search banner', () => {
    renderAsk(makeIndex({ searchMode: 'keyword' }));
    expect(screen.getByText(/Basic search for this language/)).toBeTruthy();
    cleanup();
    renderAsk(makeIndex({ searchMode: 'hybrid' }));
    expect(screen.queryByText(/Basic search for this language/)).toBeNull();
  });
});
