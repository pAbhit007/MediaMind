import 'fake-indexeddb/auto';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TranscriptView } from '../src/features/transcript/TranscriptView';
import { db } from '../src/db/schema';
import { makeIndex } from './fixtures/video';

beforeEach(async () => {
  await db.notes.clear();
  await db.activity.clear();
});
afterEach(cleanup);

const renderTr = (seek = vi.fn(), time = 250) =>
  render(<TranscriptView videoId="v1" index={makeIndex()} time={time} startAt={200} seek={seek} onClose={() => {}} />);

describe('TranscriptView', () => {
  it('groups lines under chapter headings and marks the current line', () => {
    renderTr();
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual([
      'What a neuron computes',
      'Gradient descent',
      'Backpropagation',
    ]);
    expect(document.querySelector('.mm-tr-line.is-now')!.textContent).toContain('line 8 about topic 1');
  });

  it('clicking a line seeks to it', () => {
    const seek = vi.fn();
    renderTr(seek);
    fireEvent.click(screen.getByText(/line 3 about topic 0/));
    expect(seek).toHaveBeenCalledWith(90);
  });

  it('selecting text and clicking Highlight saves a highlight note and logs it', async () => {
    renderTr();
    const line = screen.getByText(/line 12 about topic 1/);
    const textNode = [...line.childNodes].find((n) => n.nodeType === 3 && n.textContent!.includes('line 12'))!;
    const range = document.createRange();
    const from = textNode.textContent!.indexOf('line 12');
    range.setStart(textNode, from);
    range.setEnd(textNode, from + 'line 12 about'.length);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    fireEvent.mouseUp(line);
    fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
    await waitFor(async () => expect((await db.activity.toArray())[0]?.highlight).toBe(1));
    const notes = await db.notes.toArray();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ videoId: 'v1', kind: 'highlight', t: 360, quote: 'line 12 about' });
  });
});
