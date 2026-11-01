import type { Segment, VideoIndex } from '@mediamind/engine';
import type { VideoMeta } from '../../src/db/schema';

export const seg = (idx: number, start: number, text: string): Segment => ({
  idx,
  start,
  end: start + 30,
  text,
  indexText: text.toLowerCase(),
  lang: 'en',
  keywords: [],
});

export const makeMeta = (over: Partial<VideoMeta> = {}): VideoMeta => ({
  id: 'v1',
  title: 'Neural nets',
  channel: '3B1B',
  duration: 600,
  lang: 'en',
  captionTrackKey: 'en|timedtext|',
  indexedAt: 1,
  lastOpenedAt: 1,
  watchedRanges: [],
  ...over,
});

/** 600 s, 20 segments, 3 chapters (0–200, 200–400, 400–600). */
export const makeIndex = (over: Partial<VideoIndex> = {}): VideoIndex => ({
  videoId: 'v1',
  lang: 'en',
  duration: 600,
  segments: Array.from({ length: 20 }, (_, i) => seg(i, i * 30, `line ${i} about topic ${Math.floor(i / 7)}`)),
  embeddings: [],
  chapters: [
    { idx: 0, start: 0, end: 200, title: 'What a neuron computes', source: 'auto', keywords: ['weights', 'bias'] },
    { idx: 1, start: 200, end: 400, title: 'Gradient descent', source: 'auto', keywords: ['slope'] },
    { idx: 2, start: 400, end: 600, title: 'Backpropagation', source: 'auto', keywords: ['chain rule', 'error'] },
  ],
  searchMode: 'keyword',
  suggestions: ['What is a loss function?', 'Why use ReLU?', 'Learning rate?'],
  ...over,
});
