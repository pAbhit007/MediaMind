import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Note, VideoMeta } from '../../db/schema';
import * as repo from '../../db/repo';
import { StickyNote, formatTime } from '../../ui/cards';
import { toMarkdown } from './markdown';

export const UNDO_MS = 5000;

/** A request to start a note pinned to `time` (N key or the page's Alt+N). */
export type NoteRequest = { time: number; seq: number };

type Props = {
  meta: VideoMeta;
  time: number;
  seek: (t: number) => void;
  request: NoteRequest | null;
  onRequestHandled: () => void;
  onOpenTranscript: (t: number) => void;
};

const fileName = (title: string) =>
  `${(title || 'notes').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'notes'}.md`;

function NoteItem({
  note,
  seek,
  onSave,
  onDelete,
}: {
  note: Note;
  seek: (t: number) => void;
  onSave: (text: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);
  return (
    <div className={`mm-note is-${note.kind}`} data-testid="note">
      <StickyNote ts={note.t} onSeek={seek}>
        <button type="button" className="mm-note-del" aria-label="Delete note" onClick={onDelete}>
          ✕
        </button>
        {editing ? (
          <textarea
            className="mm-note-edit"
            autoFocus
            aria-label="Edit note"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setEditing(false);
              setDraft(note.text);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setEditing(false);
                setDraft(note.text);
              } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                setEditing(false);
                if (draft.trim() !== note.text) onSave(draft.trim());
              }
            }}
          />
        ) : (
          <div
            className="mm-note-text"
            role="button"
            tabIndex={0}
            title="Click to edit"
            onClick={() => setEditing(true)}
            onKeyDown={(e) => e.key === 'Enter' && setEditing(true)}
          >
            {note.text || (note.kind === 'highlight' ? 'Highlighted from transcript' : '')}
          </div>
        )}
        {note.quote && <blockquote className="mm-quote">“{note.quote}”</blockquote>}
      </StickyNote>
    </div>
  );
}

export function NotesTab({ meta, time, seek, request, onRequestHandled, onOpenTranscript }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState('');
  const [stamp, setStamp] = useState<number | null>(null);
  const [undo, setUndo] = useState<Note | null>(null);
  const [menu, setMenu] = useState(false);
  const [status, setStatus] = useState('');
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const videoId = meta.id;

  const reload = useCallback(async () => {
    const rows = await repo.listNotes(videoId);
    setNotes(rows.sort((a, b) => b.createdAt - a.createdAt));
  }, [videoId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  useEffect(() => {
    if (!request) return;
    setStamp(request.time);
    editorRef.current?.focus();
    onRequestHandled();
  }, [request, onRequestHandled]);

  const save = async () => {
    const body = text.trim();
    if (!body) return;
    const t = stamp ?? time;
    setText('');
    setStamp(null);
    await repo.addNote({ videoId, kind: 'note', t, text: body });
    await reload();
    await repo.logActivity('note').catch(() => {});
  };

  const remove = async (n: Note) => {
    await repo.deleteNote(n.id);
    setNotes((xs) => xs.filter((x) => x.id !== n.id));
    setUndo(n);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  };
  const restore = async () => {
    if (!undo) return;
    clearTimeout(undoTimer.current);
    const n = undo;
    setUndo(null);
    await repo.restoreNote(n);
    await reload();
  };

  const exportMd = async (how: 'download' | 'copy') => {
    setMenu(false);
    const md = toMarkdown(meta, await repo.listNotes(videoId));
    if (how === 'copy') {
      try {
        await navigator.clipboard.writeText(md);
        setStatus('Copied as Markdown ✓');
      } catch {
        setStatus('Could not copy — try Download .md');
      }
    } else {
      const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName(meta.title);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Downloaded ✓');
    }
    setTimeout(() => setStatus(''), 3000);
  };

  const shown = stamp ?? time;
  return (
    <div className="mm-notes">
      <div className="mm-editor">
        <textarea
          ref={editorRef}
          rows={2}
          value={text}
          placeholder={`✍️ Note at ${formatTime(shown)}…`}
          aria-label={`Note at ${formatTime(shown)}`}
          onFocus={() => setStamp((s) => s ?? time)}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void save();
            }
          }}
        />
        <kbd>N</kbd>
      </div>

      {notes.length === 0 && <div className="mm-notes-empty">No notes yet — press N to pin one to this second.</div>}
      {notes.map((n) => (
        <NoteItem
          key={n.id}
          note={n}
          seek={seek}
          onDelete={() => void remove(n)}
          onSave={(t) => void repo.updateNote(n.id, { text: t }).then(reload)}
        />
      ))}

      {undo && (
        <div className="mm-toast" role="status">
          Note deleted
          <button type="button" onClick={() => void restore()}>
            Undo
          </button>
        </div>
      )}

      <div className="mm-notes-spacer" />
      <div className="mm-notes-actions">
        <button type="button" className="mm-btn is-ghost" onClick={() => onOpenTranscript(time)}>
          Transcript
        </button>
        <div className="mm-export">
          <button type="button" className="mm-btn" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            Export ▾
          </button>
          {menu && (
            <div className="mm-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => void exportMd('download')}>
                Download .md
              </button>
              <button type="button" role="menuitem" onClick={() => void exportMd('copy')}>
                Copy as Markdown
              </button>
            </div>
          )}
        </div>
      </div>
      {status && (
        <div className="mm-notes-status" role="status">
          {status}
        </div>
      )}
    </div>
  );
}
