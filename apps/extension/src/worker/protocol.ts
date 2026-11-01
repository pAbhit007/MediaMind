import type { Hit, VideoIndex } from '@mediamind/engine';
import type { IndexInput, IndexStage } from '@mediamind/engine';

export type WorkerRequest =
  | { id: number; type: 'index'; input: IndexInput }
  | { id: number; type: 'load'; index: VideoIndex }
  | { id: number; type: 'ask'; videoId: string; query: string };

export type WorkerResponse =
  | { id: number; type: 'progress'; stage: IndexStage; fraction: number }
  | { id: number; type: 'indexed'; index: VideoIndex; embedder: 'ok' | 'unavailable' }
  | { id: number; type: 'loaded' }
  | { id: number; type: 'answer'; hits: Hit[] }
  | { id: number; type: 'error'; message: string };
