import type { Chapter, Cue, Embedder, SearchMode, VideoIndex } from './types';
import { segmentCues } from './segment';
import { extractKeywords, suggestQuestions, topKeywords } from './keywords';
import { autoChapters, evenChapters, titleChapters } from './chapters';

export type IndexInput = {
  videoId: string;
  duration: number;
  lang: string;
  cues: Cue[];
  translatedCues?: Cue[];
  creatorChapters: Chapter[];
};
export type IndexStage = 'segmenting' | 'embedding' | 'chapters' | 'done';

const BATCH = 32;

export async function indexVideo(
  input: IndexInput,
  embedder: Embedder | null,
  onProgress?: (stage: IndexStage, fraction: number) => void,
): Promise<VideoIndex> {
  const { videoId, duration, lang, cues, translatedCues, creatorChapters } = input;
  const hybrid = !!embedder && (lang.toLowerCase().startsWith('en') || !!translatedCues);
  const searchMode: SearchMode = hybrid ? 'hybrid' : 'keyword';

  onProgress?.('segmenting', 0);
  const raw = segmentCues(cues, lang, translatedCues);
  const indexTexts = raw.map((s) => s.indexText);
  const kws = extractKeywords(indexTexts);
  const segments = raw.map((s, i) => ({ ...s, keywords: kws[i] }));
  onProgress?.('segmenting', 1);

  const embeddings: Float32Array[] = [];
  if (hybrid && embedder) {
    onProgress?.('embedding', 0);
    for (let i = 0; i < indexTexts.length; i += BATCH) {
      embeddings.push(...(await embedder.embed(indexTexts.slice(i, i + BATCH))));
      onProgress?.('embedding', Math.min(1, (i + BATCH) / indexTexts.length));
    }
    if (!indexTexts.length) onProgress?.('embedding', 1);
  }

  onProgress?.('chapters', 0);
  const base = creatorChapters.length
    ? creatorChapters
    : hybrid
      ? autoChapters(segments, embeddings, duration)
      : evenChapters(segments, duration);
  const chapters = titleChapters(base, segments);
  onProgress?.('chapters', 1);

  const suggestions = suggestQuestions(topKeywords(indexTexts, 3));
  onProgress?.('done', 1);
  return { videoId, lang, duration, segments, embeddings, chapters, searchMode, suggestions };
}
