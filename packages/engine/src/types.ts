export type Cue = { start: number; dur: number; text: string }; // seconds
export type CaptionTrack = {
  languageCode: string;
  kind: 'asr' | 'manual';
  name: string;
  baseUrl: string;
  isTranslatable: boolean;
};
export type Segment = {
  idx: number;
  start: number;
  end: number;
  text: string;
  indexText: string;
  lang: string;
  keywords: string[];
};
export type ChapterSource = 'creator' | 'auto' | 'even';
export type Chapter = {
  idx: number;
  start: number;
  end: number;
  title: string;
  source: ChapterSource;
  keywords: string[];
};
export type SearchMode = 'hybrid' | 'keyword';
export type VideoIndex = {
  videoId: string;
  lang: string;
  duration: number;
  segments: Segment[];
  embeddings: Float32Array[];
  chapters: Chapter[];
  searchMode: SearchMode;
  suggestions: string[];
};
export type Hit = {
  segmentIdx: number;
  start: number;
  end: number;
  text: string;
  score: number;
  matchedTerms: string[];
};
export interface Embedder {
  embed(texts: string[]): Promise<Float32Array[]>; // 384-d, L2-normalized
}
