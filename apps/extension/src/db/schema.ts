import Dexie, { type EntityTable } from 'dexie';
import type { Chapter, Segment } from '@mediamind/engine';

export const SCHEMA_VERSION = 1;

export type VideoMeta = {
  id: string;
  title: string;
  channel: string;
  duration: number;
  lang: string;
  captionTrackKey: string;
  indexedAt: number;
  lastOpenedAt: number;
  watchedRanges: [number, number][];
  /** Kept on the row so loadIndex can rebuild the full VideoIndex. */
  searchMode?: 'hybrid' | 'keyword';
  suggestions?: string[];
};
export type SegmentRow = Segment & { videoId: string; embedding: Float32Array };
export type ChapterRow = Chapter & { videoId: string };
export type Note = {
  id: string;
  videoId: string;
  t: number;
  text: string;
  quote?: string;
  kind: 'note' | 'highlight' | 'ask';
  createdAt: number;
  updatedAt: number;
};
export type ActivityRow = { date: string; ask: number; note: number; highlight: number };

export type Settings = {
  onboardingDone: boolean;
  purpose: 'study' | 'work' | 'curiosity' | null;
  dailyGoal: '1video' | '10cards' | '20min' | null;
};
export const DEFAULT_SETTINGS: Settings = { onboardingDone: false, purpose: null, dailyGoal: null };

class MediaMindDB extends Dexie {
  videos!: EntityTable<VideoMeta, 'id'>;
  segments!: Dexie.Table<SegmentRow, [string, number]>;
  chapters!: Dexie.Table<ChapterRow, [string, number]>;
  notes!: EntityTable<Note, 'id'>;
  activity!: EntityTable<ActivityRow, 'date'>;
  constructor() {
    super('mediamind');
    this.version(1).stores({
      videos: 'id, lastOpenedAt',
      segments: '[videoId+idx], videoId',
      chapters: '[videoId+idx], videoId',
      notes: 'id, videoId, createdAt',
      activity: 'date',
    });
  }
}

export const db = new MediaMindDB();
