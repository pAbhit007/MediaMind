import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Hit } from '@mediamind/engine';
import { useVideoSession, type SessionState } from '../../session/useVideoSession';
import { useStreak } from '../../session/useStreak';
import { Header } from '../../ui/Header';
import { Tabs, type TabId } from '../../ui/Tabs';
import { getSettings } from '../../db/settings';
import { Onboarding } from '../../features/welcome/Onboarding';
import { CaptionError, ComingSoon, Loading, NoCaptions, NoVideo } from '../../ui/EmptyStates';
import { AskTab, isTyping } from '../../features/ask/AskTab';
import { ChaptersTab } from '../../features/chapters/ChaptersTab';
import { NotesTab, type NoteRequest } from '../../features/notes/NotesTab';
import { TranscriptView } from '../../features/transcript/TranscriptView';

type ReadyState = Extract<SessionState, { s: 'ready' }>;

type PanelProps = {
  state: SessionState;
  streak: number;
  seek: (t: number) => void;
  retry: () => void;
  pause?: () => void;
  ask?: (q: string) => Promise<Hit[]>;
  onNewNote?: (fn: (time: number) => void) => () => void;
};

const noAsk = async (): Promise<Hit[]> => [];
const noop = () => {};

/** The main side panel for a given session state (pure; App wires the hooks). */
export function Panel({ state, streak, seek, retry, pause = noop, ask = noAsk, onNewNote }: PanelProps) {
  const [tab, setTab] = useState<TabId>('ask');
  const [transcriptAt, setTranscriptAt] = useState<number | null>(null);
  const [noteReq, setNoteReq] = useState<NoteRequest | null>(null);
  const ready = state.s === 'ready' ? state : null;
  const timeRef = useRef(0);
  timeRef.current = ready?.time ?? 0;
  const videoId = ready?.videoId;
  useEffect(() => setTranscriptAt(null), [videoId]);

  const startNote = useCallback(
    (time: number) => {
      pause();
      setTranscriptAt(null);
      setTab('notes');
      setNoteReq((r) => ({ time, seq: (r?.seq ?? 0) + 1 }));
    },
    [pause],
  );
  const isReady = !!ready;
  useEffect(() => {
    if (!isReady) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'n' && e.key !== 'N') || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      startNote(timeRef.current);
    };
    window.addEventListener('keydown', onKey);
    const off = onNewNote?.((t) => startNote(t));
    return () => {
      window.removeEventListener('keydown', onKey);
      off?.();
    };
  }, [isReady, startNote, onNewNote]);
  const handled = useCallback(() => setNoteReq(null), []);

  const pickTab = (t: TabId) => {
    setTranscriptAt(null);
    setTab(t);
  };

  let body: React.ReactNode = null;
  if (ready && transcriptAt != null)
    body = (
      <TranscriptView
        videoId={ready.videoId}
        index={ready.index}
        time={ready.time}
        startAt={transcriptAt}
        seek={seek}
        onClose={() => setTranscriptAt(null)}
      />
    );
  else if (ready)
    switch (tab) {
      case 'ask':
        body = <AskTab videoId={ready.videoId} index={ready.index} duration={ready.meta.duration} ask={ask} seek={seek} />;
        break;
      case 'chapters':
        body = (
          <ChaptersTab meta={ready.meta} index={ready.index} time={ready.time} seek={seek} onOpenTranscript={setTranscriptAt} />
        );
        break;
      case 'notes':
        body = (
          <NotesTab
            meta={ready.meta}
            time={ready.time}
            seek={seek}
            request={noteReq}
            onRequestHandled={handled}
            onOpenTranscript={setTranscriptAt}
          />
        );
        break;
      case 'cards':
      case 'map':
        body = <ComingSoon tab={tab} />;
    }

  return (
    <div className="mm-panel">
      <Header streak={streak} />
      {ready && <Tabs value={tab} onChange={pickTab} />}
      <main className="mm-body" id="mm-tabpanel" role={ready ? 'tabpanel' : undefined}>
        {state.s === 'no-video' && <NoVideo recent={state.recent} />}
        {state.s === 'loading' && <Loading stage={state.stage} fraction={state.fraction} />}
        {state.s === 'no-captions' && <NoCaptions title={state.title} />}
        {state.s === 'caption-error' && <CaptionError title={state.title} onRetry={retry} />}
        {body}
      </main>
    </div>
  );
}

export default function App() {
  const { state, seek, pause, ask, retry, onNewNote } = useVideoSession();
  const streak = useStreak();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [welcomed, setWelcomed] = useState(false);
  useEffect(() => {
    let live = true;
    getSettings().then(
      (s) => live && setOnboarded(s.onboardingDone),
      () => live && setOnboarded(true), // storage unavailable: don't trap the user in onboarding
    );
    return () => {
      live = false;
    };
  }, []);

  if (onboarded === null) return <div className="mm-panel" />; // avoid flashing the wrong screen
  // The greeting plays on every panel open; Setup only until onboarding is done.
  if (!welcomed)
    return (
      <Onboarding
        onboarded={onboarded}
        onFinished={() => {
          setOnboarded(true);
          setWelcomed(true);
        }}
      />
    );
  return <Panel state={state} streak={streak} seek={seek} retry={retry} pause={pause} ask={ask} onNewNote={onNewNote} />;
}
