import 'fake-indexeddb/auto';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Panel } from '../src/entrypoints/sidepanel/App';
import type { SessionState } from '../src/session/useVideoSession';
import { db } from '../src/db/schema';
import { makeIndex, makeMeta } from './fixtures/video';

const ready = (time = 125): SessionState => ({ s: 'ready', videoId: 'v1', meta: makeMeta(), index: makeIndex(), time, playing: true });

let pause: ReturnType<typeof vi.fn>;
let seek: ReturnType<typeof vi.fn>;
let emitNewNote: (t: number) => void;
const onNewNote = (fn: (t: number) => void) => {
  emitNewNote = fn;
  return () => {};
};
const renderPanel = (time = 125) =>
  render(<Panel state={ready(time)} streak={0} seek={seek as any} retry={() => {}} pause={pause as any} onNewNote={onNewNote} />);
const editor = () => screen.getByRole('textbox', { name: /^Note at/ }) as HTMLTextAreaElement;
const openNotes = () => fireEvent.click(screen.getByRole('tab', { name: 'Notes' }));

beforeEach(async () => {
  pause = vi.fn();
  seek = vi.fn();
  await db.notes.clear();
  await db.activity.clear();
});
afterEach(cleanup);

describe('Notes', () => {
  it('N opens the editor at the current time and pauses', async () => {
    renderPanel(125);
    fireEvent.keyDown(document.body, { key: 'n' });
    expect(pause).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(editor());
    expect(editor().placeholder).toBe('✍️ Note at 2:05…');
  });

  it('N is ignored while typing in an input', () => {
    renderPanel();
    const input = screen.getByPlaceholderText('Ask this video…');
    fireEvent.keyDown(input, { key: 'n' });
    expect(pause).not.toHaveBeenCalled();
  });

  it('a newNote message does the same at the given time', () => {
    renderPanel(125);
    act(() => emitNewNote(330));
    expect(pause).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(editor());
    expect(editor().placeholder).toBe('✍️ Note at 5:30…');
  });

  it('Enter saves (Shift+Enter does not) and logs a note activity', async () => {
    renderPanel(125);
    fireEvent.keyDown(document.body, { key: 'N' });
    fireEvent.change(editor(), { target: { value: 'Chain rule!' } });
    fireEvent.keyDown(editor(), { key: 'Enter', shiftKey: true });
    expect(await db.notes.count()).toBe(0);
    fireEvent.keyDown(editor(), { key: 'Enter' });
    await screen.findByText('Chain rule!');
    await waitFor(async () => expect((await db.activity.toArray())[0]?.note).toBe(1));
    expect(await db.notes.toArray()).toMatchObject([{ kind: 'note', t: 125, text: 'Chain rule!' }]);
    expect(editor().value).toBe('');
  });

  it('lists notes newest first with quotes; timestamp seeks', async () => {
    await db.notes.bulkAdd([
      { id: 'a', videoId: 'v1', t: 50, text: 'older', kind: 'note', createdAt: 1, updatedAt: 1 },
      { id: 'b', videoId: 'v1', t: 10, text: 'newer', quote: 'a quoted line', kind: 'ask', createdAt: 2, updatedAt: 2 },
    ]);
    renderPanel();
    openNotes();
    await screen.findByText('newer');
    const items = screen.getAllByTestId('note');
    expect(items[0].textContent).toContain('newer');
    expect(items[0].querySelector('.mm-quote')!.textContent).toBe('“a quoted line”');
    expect(items[1].querySelector('.mm-quote')).toBeNull();
    fireEvent.click(screen.getByTitle('Jump to 0:50'));
    expect(seek).toHaveBeenCalledWith(50);
  });

  it('edits a note in place', async () => {
    await db.notes.add({ id: 'a', videoId: 'v1', t: 50, text: 'typo', kind: 'note', createdAt: 1, updatedAt: 1 });
    renderPanel();
    openNotes();
    fireEvent.click(await screen.findByText('typo'));
    const box = screen.getByRole('textbox', { name: 'Edit note' });
    fireEvent.change(box, { target: { value: 'fixed' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await screen.findByText('fixed');
    expect((await db.notes.get('a'))!.text).toBe('fixed');
  });

  it('delete then undo restores the note', async () => {
    await db.notes.add({ id: 'a', videoId: 'v1', t: 50, text: 'keep me', kind: 'note', createdAt: 1, updatedAt: 1 });
    renderPanel();
    openNotes();
    await screen.findByText('keep me');
    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }));
    await screen.findByText('Note deleted');
    expect(screen.queryByText('keep me')).toBeNull();
    expect(await db.notes.count()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await screen.findByText('keep me');
    expect((await db.notes.get('a'))!.createdAt).toBe(1);
  });

  it('Copy as Markdown writes the export to the clipboard', async () => {
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await db.notes.add({ id: 'a', videoId: 'v1', t: 50, text: 'hi', kind: 'note', createdAt: 1, updatedAt: 1 });
    renderPanel();
    openNotes();
    fireEvent.click(screen.getByRole('button', { name: 'Export ▾' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy as Markdown' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain('## [0:50](https://www.youtube.com/watch?v=v1&t=50s)\nhi');
  });

  it('Transcript button opens the transcript view', async () => {
    renderPanel();
    openNotes();
    fireEvent.click(screen.getByRole('button', { name: 'Transcript' }));
    expect(screen.getByRole('button', { name: '← Back' })).toBeTruthy();
  });
});
