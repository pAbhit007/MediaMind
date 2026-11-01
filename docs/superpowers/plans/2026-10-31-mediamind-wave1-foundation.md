# MediaMind Wave 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Python/Gemini MediaMind with a Chrome MV3 extension that captures YouTube captions, indexes them fully on-device (no LLM, no server, no key) and offers Welcome, Ask, Chapters, Transcript and Notes in the Study Desk / Index Card design.

**Architecture:** A pnpm monorepo. `packages/engine` is pure TypeScript (no DOM, no Chrome APIs): caption parsing, segmentation, keywords, BM25, hybrid search, chapters, the indexing pipeline. `apps/extension` (WXT + React) holds the YouTube module (content + main-world scripts), the background worker, IndexedDB storage, and the side-panel UI. Indexing runs in a Web Worker owned by the side panel, using a bundled quantized MiniLM through transformers.js.

**Tech Stack:** TypeScript 5, pnpm workspaces, WXT, React 18, Dexie 4, @huggingface/transformers 3 (ONNX/WASM), Vitest, @testing-library/react, fake-indexeddb, jsdom.

**Spec:** `docs/superpowers/specs/2026-10-31-mediamind-wave1-foundation-design.md`. Visual reference: `.superpowers/brainstorm/29046-1793422705/content/full-design-v1.html` (welcome screen, panel screens) and `inner-cards-v1.html` option A (Index Card).

## Global Constraints

- No network requests except to `https://www.youtube.com/*`. No CDN scripts, no remote fonts, no runtime model download.
- Manifest permissions exactly: `sidePanel`, `storage`, `scripting`, `activeTab`, `commands`; host permissions exactly: `https://www.youtube.com/*`.
- Extension CSP: `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`.
- Built package (`apps/extension/.output/chrome-mv3`) ≤ 40 MB.
- Embedding model: `Xenova/all-MiniLM-L6-v2`, quantized, 384-d, mean-pooled, L2-normalized, files under `apps/extension/public/models/`.
- Segments 25–40 s; chapters ≥ 120 s; 4–10 auto chapters per hour; Ask returns top 3 non-overlapping; chapter watched at ≥ 80 % played.
- Perf: index a 40-min captioned video ≤ 10 s (model cached); Ask ≤ 200 ms.
- Theme tokens (exact): paper `#faf6ee`, ink `#2b2620`, line `#e6dccb`, soft `#8a7d6b`, amber `#d9a441`, amberbg `#f1e7d4`, rust `#b4532a`, leaf `#4f7a4a`, marigold `#f2a516`, kumkum `#a8323e`. Serif body Georgia/Iowan Old Style; system sans for chrome; monospace timestamps; bundled Caveat (OFL) for handwriting.
- Welcome: greeting changes every 1.2 s through the 10 greetings in spec §4.2 in that order; Continue enables at 2.5 s; Skip always enabled; `prefers-reduced-motion` → no spin, Continue enabled immediately.
- Streak counts only deliberate actions (`ask`, `note`, `highlight`); indexing never counts.
- All YouTube-specific code lives under `apps/extension/src/youtube/`.
- The old files in the repo root stay untouched until Task 17.

## Review Focus

1. **Navigating to another video while one is indexing** → the panel must show the new video only; results from the stale index must never appear (Task 11 test `ignores stale index results after navigation`).
2. **Very short (< 2 min) and very long (3 h+) videos** → at least one chapter, never more than 10 per hour, no zero-length chapters (Task 6 tests `short video yields one chapter`, `3h video stays within cap`).
3. **Captions turned off by the user** → capture still works and the user's CC setting is restored afterwards (Task 9 test `restores captions-off state`).
4. **Empty, stop-word-only or no-match questions** → "No moment in this video matches that" card instead of three random results (Task 5 test `returns empty below min score`).
5. **Auto-caption junk** (`[Music]`, `>>`, HTML entities like `&#39;`, newlines inside cues, duplicated rolling lines) → cleaned before segmenting and never shown raw (Task 2 test `cleans auto-caption noise`).

---

## File Structure

```
package.json                     pnpm workspace root (scripts: test, build, typecheck)
pnpm-workspace.yaml
.gitignore
packages/engine/
  src/types.ts                   Cue, CaptionTrack, Segment, Chapter, VideoIndex, Hit, Embedder
  src/captions.ts                parse json3, clean text, parse description chapters, pick track
  src/segment.ts                 cues → segments, align translation
  src/text.ts                    tokenize, stopwords, stem-lite
  src/keywords.ts                TF-IDF keywords, suggested questions
  src/bm25.ts                    BM25 index
  src/search.ts                  hybrid search
  src/chapters.ts                auto / even / creator chapters, titles, key points
  src/pipeline.ts                indexVideo()
  src/index.ts                   public exports
  test/fixtures/*.json           real caption samples (lecture EN, podcast EN, Hindi + tlang=en)
apps/extension/
  wxt.config.ts                  manifest, CSP, permissions, commands
  scripts/fetch-model.ts         downloads model + ort wasm into public/ at build time
  public/models/…, public/fonts/Caveat-*.woff2
  src/youtube/main-world.ts      runs in page: observes timedtext, fetches tlang=en, CC toggle
  src/youtube/captions.ts        content-side API: getCaptions(videoId)
  src/youtube/transcript-dom.ts  hidden "Show transcript" fallback
  src/youtube/player.ts          seek, pause, currentTime, watched ranges, nav events
  src/entrypoints/youtube.content.ts
  src/entrypoints/youtube-main.content.ts (world: MAIN)
  src/entrypoints/background.ts
  src/entrypoints/sidepanel/{index.html,main.tsx,App.tsx}
  src/messaging.ts               typed message contracts
  src/db/{schema.ts,repo.ts,streak.ts}
  src/worker/{embedder.ts,index.worker.ts,client.ts}
  src/ui/theme.css, src/ui/cards.tsx (IndexCard, StickyNote, Timestamp, Mark)
  src/ui/{Header,Tabs,EmptyStates}.tsx
  src/features/welcome/{Welcome,Setup}.tsx
  src/features/ask/AskTab.tsx
  src/features/chapters/ChaptersTab.tsx
  src/features/transcript/TranscriptView.tsx
  src/features/notes/{NotesTab.tsx,markdown.ts}
  src/session/useVideoSession.ts  current video + index lifecycle
```

---

### Task 1: Workspace scaffold, manifest and theme

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `packages/engine/{package.json,tsconfig.json,vitest.config.ts,src/index.ts,src/types.ts}`, `apps/extension/{package.json,tsconfig.json,wxt.config.ts,vitest.config.ts,src/ui/theme.css,src/entrypoints/sidepanel/*,src/entrypoints/background.ts}`, `apps/extension/public/fonts/Caveat-Regular.woff2`, `apps/extension/test/manifest.test.ts`

**Interfaces:**
- Produces (`packages/engine/src/types.ts`, exported from `@mediamind/engine`):
```ts
export type Cue = { start: number; dur: number; text: string };          // seconds
export type CaptionTrack = { languageCode: string; kind: 'asr' | 'manual'; name: string; baseUrl: string; isTranslatable: boolean };
export type Segment = { idx: number; start: number; end: number; text: string; indexText: string; lang: string; keywords: string[] };
export type ChapterSource = 'creator' | 'auto' | 'even';
export type Chapter = { idx: number; start: number; end: number; title: string; source: ChapterSource; keywords: string[] };
export type SearchMode = 'hybrid' | 'keyword';
export type VideoIndex = { videoId: string; lang: string; duration: number; segments: Segment[]; embeddings: Float32Array[]; chapters: Chapter[]; searchMode: SearchMode; suggestions: string[] };
export type Hit = { segmentIdx: number; start: number; end: number; text: string; score: number; matchedTerms: string[] };
export interface Embedder { embed(texts: string[]): Promise<Float32Array[]> } // 384-d, L2-normalized
```
- Produces: CSS custom properties `--paper --ink --line --soft --amber --amberbg --rust --leaf --marigold --kumkum`, font families `--serif --sans --mono --hand` in `theme.css`.

- [ ] **Step 1:** `git init`; first commit the existing legacy files as-is (`chore: snapshot legacy MediaMind`) so Task 17's deletion stays recoverable. Then add `.gitignore` with `node_modules/ .output/ .wxt/ .superpowers/ apps/extension/public/models/ __pycache__/`. Root `package.json` scripts: `test` → `pnpm -r test`, `build` → `pnpm --filter extension build`, `typecheck` → `pnpm -r typecheck`.
- [ ] **Step 2: Write the failing test** `apps/extension/test/manifest.test.ts`: after build, read `.output/chrome-mv3/manifest.json` and assert `permissions` sorted equals `['activeTab','commands','scripting','sidePanel','storage']`, `host_permissions` equals `['https://www.youtube.com/*']`, `content_security_policy.extension_pages` equals `"script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"`, `side_panel.default_path` is `sidepanel.html`, and `commands['new-note'].suggested_key.default` equals `'Alt+N'`.
- [ ] **Step 3:** Run `pnpm build && pnpm --filter extension test manifest` — Expected: FAIL (no build).
- [ ] **Step 4:** Scaffold WXT React app; set manifest in `wxt.config.ts` (name "MediaMind", description "Turn any YouTube video into notes, chapters & flashcards — on your device."), reuse `icons/icon.png` copied into `apps/extension/public/icon.png`. Background sets `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`. Side panel renders "MediaMind" in `--serif` on `--paper`. Bundle Caveat woff2 via `@font-face` in `theme.css`.
- [ ] **Step 5:** Run `pnpm build && pnpm test` — Expected: PASS. Load `.output/chrome-mv3` unpacked in Chrome; clicking the icon opens a paper-coloured panel.
- [ ] **Step 6:** Commit `chore: scaffold MediaMind monorepo and MV3 extension`.

### Task 2: Caption parsing, cleaning, track choice, creator chapters

**Files:** Create `packages/engine/src/captions.ts`, `packages/engine/test/captions.test.ts`, fixtures `test/fixtures/{lecture-en.json3.json,podcast-en-asr.json3.json,hindi.json3.json,hindi-tlang-en.json3.json}` (capture real responses from 3 public videos during this task).

**Interfaces:**
- Produces:
```ts
export function parseJson3(raw: unknown): Cue[];
export function cleanCueText(s: string): string;
export function pickTrack(tracks: CaptionTrack[], uiLang: string): CaptionTrack | null;
export function parseDescriptionChapters(description: string, duration: number): Chapter[]; // source 'creator'
```

- [ ] **Step 1: Write failing tests:**
  - `parses json3 events into cues`: fixture → cues with `start = tStartMs/1000`, `dur = dDurationMs/1000`, non-empty text, sorted by start.
  - `cleans auto-caption noise`: `cleanCueText("[Music] it&#39;s >> the\nchain  rule")` === `"it's the chain rule"`; `cleanCueText("[Applause]")` === `""`; parseJson3 drops empty cues and removes rolling duplicates (a cue whose text equals the previous cue's text is merged into it).
  - `pickTrack prefers manual in UI lang, then manual en, then default, then asr`: table test with 4 track lists.
  - `parses creator chapters`: `"0:00 Intro\n2:15 Gradient descent\n1:02:03 Recap"` with duration 4000 → 3 chapters, starts `[0,135,3723]`, last ends at 4000; returns `[]` if fewer than 3 timestamps or first isn't `0:00` (YouTube's own rule).
- [ ] **Step 2:** `pnpm --filter @mediamind/engine test captions` — Expected: FAIL.
- [ ] **Step 3:** Implement. Decode entities with a small map (`&amp; &#39; &quot; &lt; &gt;` + numeric), strip `[...]` and `(...)` tags that are a single word, strip `>>`, collapse whitespace.
- [ ] **Step 4:** Run tests — Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): parse and clean YouTube captions`.

### Task 3: Segmentation and translation alignment

**Files:** Create `packages/engine/src/segment.ts`, `packages/engine/test/segment.test.ts`.

**Interfaces:**
- Consumes: `Cue` (Task 1).
- Produces:
```ts
export const SEGMENT_MIN = 25, SEGMENT_MAX = 40;
export function segmentCues(cues: Cue[], lang: string, translated?: Cue[]): Omit<Segment, 'keywords'>[];
```

- [ ] **Step 1: Write failing tests:**
  - `segments are 25–40s and break on cue boundaries`: 40-min lecture fixture → every segment except the last has `25 <= end-start <= 40`; every segment start equals some cue start; segments are contiguous and cover all cues.
  - `prefers breaking after sentence punctuation within the window`.
  - `english track: indexText === text`.
  - `aligns translation by time`: hindi + tlang-en fixtures → each segment's `indexText` is the concatenation of translated cues whose midpoint falls in `[start,end)`; `lang === 'hi'`; no translated cue used twice.
  - `single cue longer than 40s becomes its own segment`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement greedy accumulation: close a segment when ≥ 40 s, or when ≥ 25 s and the cue ends with `.?!`. **Step 4:** Run — PASS. **Step 5:** Commit `feat(engine): time-based segmentation with translation alignment`.

### Task 4: Text utilities, keywords, suggested questions

**Files:** Create `packages/engine/src/text.ts`, `packages/engine/src/keywords.ts`, tests `text.test.ts`, `keywords.test.ts`.

**Interfaces:**
- Produces:
```ts
export function tokenize(s: string): string[];       // lowercase, unicode letters/digits incl. Devanagari etc., stopwords removed, light English stemming (plural s/es, -ing, -ed)
export function extractKeywords(docs: string[], topK?: number): string[][]; // per doc, unigrams + bigrams, TF-IDF over docs; default topK 5
export function topKeywords(docs: string[], k: number): string[];          // whole-video ranking
export function suggestQuestions(keywords: string[]): string[];            // exactly 3
```

- [ ] **Step 1: Write failing tests:**
  - `tokenize drops stopwords and keeps devanagari`: `tokenize("The chain rules are applied, नमस्ते")` → `['chain','rule','appli','नमस्ते']` (assert exact output of your stemmer; key point: no "the/are").
  - `bigrams beat their unigrams when frequent`: docs where "gradient descent" appears 6× → that bigram ranks above "gradient".
  - `keywords exclude filler`: words "like", "know", "gonna", "actually", "um", "uh", "okay", "right" never appear.
  - `suggestQuestions`: `['backpropagation','loss function','relu']` → `['What is backpropagation?','What is loss function?','Why relu?']` (pattern: first two "What is X?", third "Why X?"); fewer than 3 keywords → pad with `'What is this video about?'`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement (stopword list: standard English ~180 + spoken fillers above). **Step 4:** Run — PASS. **Step 5:** Commit `feat(engine): tokenizer and TF-IDF keywords`.

### Task 5: BM25 and hybrid search

**Files:** Create `packages/engine/src/bm25.ts`, `packages/engine/src/search.ts`, tests `bm25.test.ts`, `search.test.ts`.

**Interfaces:**
- Consumes: `tokenize` (Task 4), `Segment`, `Hit`.
- Produces:
```ts
export class Bm25 { constructor(docs: string[][]); score(query: string[]): Float64Array; }  // k1 1.2, b 0.75
export type SearchInput = { segments: Segment[]; embeddings: Float32Array[]; bm25: Bm25; mode: SearchMode };
export function search(input: SearchInput, query: string, queryVec: Float32Array | null, k?: number): Hit[]; // default k 3
export const MIN_SCORE = 0.35;
```
BM25 docs are `tokenize(text + ' ' + indexText)` so exact original-language words still match.

- [ ] **Step 1: Write failing tests** (use a fake embedding: one-hot vectors per topic):
  - `hybrid merges cosine and bm25`: final score = `0.65 * cosine + 0.35 * bm25Normalized` (bm25 divided by max in this query); assert ordering on a 6-segment toy.
  - `returns top 3 non-overlapping`: neighbours of a chosen hit (|idx diff| ≤ 1) are skipped.
  - `returns empty below min score`: query `"the and of"` → `[]`; unrelated query → `[]`; empty string → `[]`.
  - `keyword mode ignores vectors`: `mode:'keyword'`, `queryVec:null` → ranks by BM25 only; min score then is `bm25Normalized ≥ 0.2` and at least one matched term.
  - `matchedTerms lists query tokens present in the segment text` (for highlighting).
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS. **Step 5:** Commit `feat(engine): BM25 and hybrid search`.

### Task 6: Chapters and key points

**Files:** Create `packages/engine/src/chapters.ts`, test `chapters.test.ts`.

**Interfaces:**
- Consumes: segments + embeddings, `extractKeywords`.
- Produces:
```ts
export function autoChapters(segments: Segment[], embeddings: Float32Array[], duration: number): Chapter[];  // source 'auto'
export function evenChapters(segments: Segment[], duration: number): Chapter[];                             // source 'even', blocks of ~600s
export function titleChapters(chapters: Chapter[], segments: Segment[]): Chapter[];  // fills title + keywords from indexText
export function keyPoints(chapter: Chapter, segments: Segment[], embeddings: Float32Array[], n?: number): Segment[]; // default 3, most central = highest mean cosine to chapter centroid, returned in time order
```
Auto algorithm (TextTiling over embeddings): for each boundary between segments i and i+1, depth = similarity dip between the mean of the 3 segments before and the 3 after; target count `clamp(round(duration/3600*7), 1, max(1, floor(duration/3600*10)))`, and at least `ceil(duration/3600*4)` when duration ≥ 30 min; pick deepest boundaries greedily, rejecting any that would create a chapter < 120 s.

- [ ] **Step 1: Write failing tests:**
  - `finds topic boundaries`: synthetic 30 segments of 3 one-hot topics (10 each, 35 s) → boundaries at segments 10 and 20.
  - `short video yields one chapter`: 90-s video → exactly 1 chapter `[0, 90]`.
  - `3h video stays within cap`: 10 800 s of random vectors → `4*3 ≤ count ≤ 10*3`, every chapter ≥ 120 s.
  - `chapters are contiguous and cover [0,duration]`.
  - `titles are top keywords title-cased joined by " · "`: e.g. `"Backpropagation · Chain Rule"`, max 3 parts, max 40 chars.
  - `keyPoints returns n segments inside the chapter in time order`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS. **Step 5:** Commit `feat(engine): auto chapters and key points`.

### Task 7: Indexing pipeline

**Files:** Create `packages/engine/src/pipeline.ts`, test `pipeline.test.ts`; update `src/index.ts` exports.

**Interfaces:**
- Consumes: Tasks 2–6.
- Produces:
```ts
export type IndexInput = { videoId: string; duration: number; lang: string; cues: Cue[]; translatedCues?: Cue[]; creatorChapters: Chapter[] };
export type IndexStage = 'segmenting' | 'embedding' | 'chapters' | 'done';
export async function indexVideo(input: IndexInput, embedder: Embedder | null, onProgress?: (stage: IndexStage, fraction: number) => void): Promise<VideoIndex>;
```
Rules: `searchMode = 'hybrid'` iff `embedder` given and (`lang` starts with `en` or `translatedCues` present); otherwise `'keyword'` and `embeddings = []`. Chapters: creator if non-empty (then `titleChapters` only fills `keywords`), else auto when hybrid, else even. Embed in batches of 32, reporting fraction. `suggestions = suggestQuestions(topKeywords(indexTexts, 3))`.

- [ ] **Step 1: Write failing tests** with a fake embedder: `hybrid for english`, `hybrid for hindi with translation`, `keyword mode for hindi without translation` (chapters `source:'even'`), `creator chapters win`, `progress reaches done with fraction 1`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS. **Step 5:** Commit `feat(engine): indexVideo pipeline`.

### Task 8: Bundled MiniLM embedder in a worker

**Files:** Create `apps/extension/scripts/fetch-model.ts`, `src/worker/embedder.ts`, `src/worker/index.worker.ts`, `src/worker/client.ts`, test `apps/extension/test/embedder.node.test.ts`; modify `apps/extension/package.json` (`prebuild: tsx scripts/fetch-model.ts`).

**Interfaces:**
- Consumes: `indexVideo`, `search`, `Bm25`, `tokenize`.
- Produces:
```ts
// embedder.ts
export async function createMiniLm(modelBase: string): Promise<Embedder>; // env.allowRemoteModels = false; env.localModelPath = modelBase; wasm paths → `${modelBase}/ort/`
// client.ts (used by the UI)
export type IndexHandle = { videoId: string; index: VideoIndex };
export function indexInWorker(input: IndexInput, onProgress: (s: IndexStage, f: number) => void, signal: AbortSignal): Promise<IndexHandle>;
export function askInWorker(videoId: string, query: string): Promise<Hit[]>;
```
The worker keeps the last `VideoIndex` + its `Bm25` in memory keyed by videoId; `askInWorker` embeds the query (if hybrid) and calls `search`.

- [ ] **Step 1:** `fetch-model.ts` downloads `onnx/model_quantized.onnx`, `tokenizer.json`, `tokenizer_config.json`, `config.json` for `Xenova/all-MiniLM-L6-v2` into `public/models/Xenova/all-MiniLM-L6-v2/`, and copies onnxruntime-web `*.wasm` from node_modules into `public/models/ort/`; skips files already present.
- [ ] **Step 2: Write failing test** `embedder.node.test.ts`: `createMiniLm` with the local folder; `embed(['backpropagation is the chain rule','how gradients flow backwards','my favourite pizza'])` → 3 vectors of length 384, norms ≈ 1 (±1e-3), cosine(0,1) > cosine(0,2) + 0.2.
- [ ] **Step 3:** Run — FAIL. **Step 4:** Implement. **Step 5:** Run — PASS.
- [ ] **Step 6:** Add `test/size.test.ts`: total bytes under `.output/chrome-mv3` ≤ 40 × 1024². Run `pnpm build && pnpm --filter extension test size` — PASS.
- [ ] **Step 7:** Commit `feat(extension): bundled MiniLM embedder and index worker`.

### Task 9: YouTube caption capture (main world + DOM fallback)

**Files:** Create `src/youtube/main-world.ts`, `src/youtube/captions.ts`, `src/youtube/transcript-dom.ts`, `src/entrypoints/youtube-main.content.ts` (`world: 'MAIN'`, `runAt: 'document_start'`), tests `test/youtube/main-world.test.ts`, `test/youtube/transcript-dom.test.ts`, fixture `test/fixtures/transcript-panel.html`.

**Interfaces:**
- Consumes: `parseJson3`, `pickTrack`, `parseDescriptionChapters`.
- Produces (content-script side):
```ts
export type CaptionResult =
  | { kind: 'ok'; videoId: string; title: string; channel: string; duration: number; lang: string; cues: Cue[]; translatedCues?: Cue[]; creatorChapters: Chapter[]; via: 'timedtext' | 'dom' }
  | { kind: 'none'; videoId: string; title: string; reason: 'no-captions' | 'failed' };
export async function getCaptions(videoId: string, uiLang: string): Promise<CaptionResult>;
```
Main world ↔ content script via `window.postMessage` with `source: 'mediamind'` and a per-page random nonce passed in a `data-mm-nonce` attribute on `<html>`; ignore messages without it.

Main-world flow: wrap `window.fetch` and `XMLHttpRequest.prototype.open/send` to remember the last response for URLs containing `/api/timedtext` and `v=<id>`. On request from the content script: read `ytInitialPlayerResponse` / `movie_player.getPlayerResponse()` for tracks, duration, title, channel, description; if no captured timedtext for the chosen track, call `player.loadModule('captions')` and `player.setOption('captions','track',{languageCode})`, wait ≤ 4 s for capture, then restore the previous track (or `unloadModule('captions')` if CC was off). Fetch the translation by re-requesting the captured URL with `&tlang=en` (and `fmt=json3`) from the main world. Timeout total 8 s → content script falls back to `transcript-dom.ts`, which adds a class that positions `ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]` off-screen, clicks the description's "Show transcript", reads `ytd-transcript-segment-renderer` rows (timestamp + text), closes the panel and removes the class.

- [ ] **Step 1: Write failing tests** (jsdom):
  - `captures timedtext responses by video id`: install hooks, stub fetch to return a json3 fixture for `/api/timedtext?v=abc&lang=en`, then a request returns those cues.
  - `restores captions-off state`: fake player with `getOption('captions','track')` → `{}` initially; after capture, `unloadModule('captions')` was called; with a track initially set, it is restored via `setOption`.
  - `requests tlang=en for non-english`: captured URL `...lang=hi...` → second fetch URL contains `tlang=en` and `fmt=json3`.
  - `ignores messages without nonce`.
  - `reads transcript panel fixture`: `"1:02:03"` → 3723 s; returns cues in order; panel class removed afterwards.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5: Manual check** on 10 real videos (EN lecture with manual captions, EN podcast auto-captions, Hindi lecture, Hinglish vlog, video with creator chapters, video with no captions, a 3 h stream, a Short-length video, CC on, CC off). Record in `docs/superpowers/notes/caption-paths.md`: which path (`timedtext`/`dom`/`none`) served each, and whether any flicker was visible.
- [ ] **Step 6:** Commit `feat(youtube): caption capture via player requests with DOM fallback`.

### Task 10: Player control, navigation, watched ranges, messaging, Alt+N

**Files:** Create `src/youtube/player.ts`, `src/messaging.ts`, `src/entrypoints/youtube.content.ts`; modify `src/entrypoints/background.ts`; tests `test/youtube/player.test.ts`, `test/messaging.test.ts`.

**Interfaces:**
- Produces (`messaging.ts`, typed with a discriminated union; panel ↔ background ↔ content via `chrome.runtime` port named `mm-panel`):
```ts
type PanelToPage = { t: 'getCaptions' } | { t: 'seek'; time: number; play?: boolean } | { t: 'pause' };
type PageToPanel =
  | { t: 'video'; videoId: string | null; title?: string }        // on load and on yt-navigate-finish
  | { t: 'time'; time: number; playing: boolean }                  // throttled to 2/s
  | { t: 'captions'; result: CaptionResult }
  | { t: 'newNote'; time: number };                                // from Alt+N
```
- Produces (`player.ts`): `mergeRanges(ranges: [number, number][]): [number, number][]`, `playedFraction(ranges, start, end): number`, `watchVideo(onEvent)`.
- Background: on `commands` `new-note` → `chrome.sidePanel.open({ tabId })`, then forward `{t:'newNote', time}` (after asking the tab's content script for current time, pausing the video). Content script persists `watchedRanges` every 10 s to background, which writes them via `repo.addWatchedRange` (Task 11).

- [ ] **Step 1: Write failing tests:** `mergeRanges` merges overlaps/adjacent (gap ≤ 1 s); `playedFraction([[0,50],[60,100]], 0, 100) === 0.9`; `emits video null on non-watch pages`; `emits new videoId on yt-navigate-finish`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5: Manual:** with panel closed on a video, press Alt+N → panel opens, video paused.
- [ ] **Step 6:** Commit `feat(extension): player bridge, navigation and Alt+N`.

### Task 11: Storage, streak and the video session

**Files:** Create `src/db/schema.ts`, `src/db/repo.ts`, `src/db/streak.ts`, `src/session/useVideoSession.ts`; tests `test/db/repo.test.ts`, `test/db/streak.test.ts`, `test/session.test.tsx` (fake-indexeddb).

**Interfaces:**
- Produces:
```ts
// schema.ts — Dexie db 'mediamind', version 1, schemaVersion 1
videos:   'id, lastOpenedAt'          // {id,title,channel,duration,lang,captionTrackKey,indexedAt,lastOpenedAt,watchedRanges}
segments: '[videoId+idx], videoId'    // Segment & {videoId, embedding: Float32Array}
chapters: '[videoId+idx], videoId'
notes:    'id, videoId, createdAt'    // {id,videoId,t,text,quote?,kind:'note'|'highlight'|'ask',createdAt,updatedAt}
activity: 'date'                      // {date:'YYYY-MM-DD', ask, note, highlight}
settings in chrome.storage.local: {onboardingDone:boolean, purpose:'study'|'work'|'curiosity'|null, dailyGoal:'1video'|'10cards'|'20min'|null}
// repo.ts
saveIndex(meta, index: VideoIndex, captionTrackKey: string): Promise<void>;
loadIndex(videoId: string, captionTrackKey: string): Promise<VideoIndex | null>;  // null if key differs → re-index, notes kept
recentVideos(n: number): Promise<VideoMeta[]>;
addNote / updateNote / deleteNote / listNotes(videoId);
addWatchedRange(videoId, range);
logActivity(kind: 'ask' | 'note' | 'highlight', date?: string): Promise<void>;
// streak.ts
export function currentStreak(activeDates: string[], today: string): number; // consecutive days ending today, or ending yesterday if today has none yet
// useVideoSession.ts
type SessionState =
  | { s: 'no-video'; recent: VideoMeta[] }
  | { s: 'loading'; videoId: string; stage: IndexStage | 'captions'; fraction: number }
  | { s: 'no-captions'; videoId: string; title: string }
  | { s: 'ready'; videoId: string; meta: VideoMeta; index: VideoIndex; time: number; playing: boolean };
export function useVideoSession(): { state: SessionState; seek(t: number): void; pause(): void; ask(q: string): Promise<Hit[]> };
```
- [ ] **Step 1: Write failing tests:**
  - `currentStreak`: `(['2026-10-29','2026-10-30','2026-10-31'],'2026-10-31') === 3`; ending yesterday counts; gap resets; `[]` → 0.
  - `loadIndex returns null when caption track changed, notes survive`.
  - `embeddings round-trip as Float32Array`.
  - `ignores stale index results after navigation`: session receives `video A`, indexing A starts (deferred promise), then `video B`; resolving A must not set state `ready` for A; the AbortSignal for A was aborted.
  - `uses cached index without re-indexing`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS. **Step 5:** Commit `feat(extension): storage, streak and video session`.

### Task 12: Panel shell — header, tabs, index-card primitives, empty states

**Files:** Create `src/ui/cards.tsx`, `src/ui/Header.tsx`, `src/ui/Tabs.tsx`, `src/ui/EmptyStates.tsx`; modify `App.tsx`, `theme.css`; test `test/ui/shell.test.tsx`.

**Interfaces:**
- Produces components: `<IndexCard label? tilted? taped? done? ts?>`, `<StickyNote ts>`, `<Timestamp t onClick>` (format `m:ss` / `h:mm:ss`, monospace, amberbg chip), `<Mark>` (underline-gradient highlighter `linear-gradient(transparent 55%, #f6d98a 55%)`), `<Header streak>` (logo tile "M", "MediaMind", pill `🔥 {n}-day streak`, hidden when n = 0), `<Tabs value onChange>` over `'ask'|'chapters'|'notes'|'cards'|'map'`.
- Index Card styling per spec §4.2 / `inner-cards-v1.html` option A: ruled background (18 px rule, `#dfe8f2`), red margin line `#e9a8a8` at 12 px, `CH. N` label in rust, Caveat for keywords and sticky notes, current chapter `rotate(-1.2deg)` with marigold tape, sticky notes `#fff7c9` `rotate(.8deg)`.
- Empty states (Index Card voice, exact copy):
  - no video: title "Open a YouTube video to start", then "Recent" list of last 3 videos (click → `chrome.tabs.create`).
  - loading: "Reading transcript…" → "Understanding the video…" (embedding) → "Finding chapters…" with progress bar.
  - no captions: "This video has no captions, so MediaMind can't read it yet."
  - keyword mode banner (Ask tab): "Basic search for this language — exact words only."
  - Cards / Map tabs: "Coming soon — flashcards with spaced repetition" / "Coming soon — a mind map of this video".

- [ ] **Step 1: Write failing tests:** header shows `🔥 5-day streak` for 5 and nothing for 0; `Timestamp` formats 3723 → `1:02:03`, 65 → `1:05`; each SessionState renders its copy; Cards/Map tabs render coming-soon cards.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS. **Step 5:** Visual check against the mockups in Chrome. **Step 6:** Commit `feat(ui): panel shell and index-card components`.

### Task 13: Welcome and Setup

**Files:** Create `src/features/welcome/Welcome.tsx`, `src/features/welcome/Setup.tsx`, `src/features/welcome/welcome.css`; modify `App.tsx`; test `test/welcome.test.tsx`.

**Interfaces:**
- Consumes: settings in `chrome.storage.local`.
- Produces: `<Welcome onContinue onSkip>`, `<Setup onDone(purpose, dailyGoal)>`. App shows Welcome when `onboardingDone` is false; Skip → writes `onboardingDone:true`, `purpose:null`, `dailyGoal:null`, goes to main UI; Continue → Setup (2 steps: purpose cards 🎓 Studying / 💼 Work & learning / 🌱 Curiosity; goal chips 1 video / 10 cards / 20 min; button "Start learning") → saves and goes to main UI.
- Port the welcome visuals from `full-design-v1.html` (toran, 16-petal rangoli spinning 40 s/turn, greeting stack, tagline, footer line, fill-up Continue). Greetings array exactly as spec §4.2, in order, with language names in small caps.

- [ ] **Step 1: Write failing tests** (fake timers):
  - `cycles greetings every 1.2s`: at t=0 "नमस्ते"; at 1200 ms "வணக்கம்"; at 12 000 ms back to "नमस्ते".
  - `continue enables at 2.5s`: disabled at 2499 ms, enabled at 2500 ms.
  - `skip is enabled immediately and marks onboarding done`.
  - `reduced motion enables continue immediately` (mock `matchMedia('(prefers-reduced-motion: reduce)')`).
  - `setup saves purpose and goal`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS. **Step 5:** Commit `feat(ui): Indian welcome screen and setup`.

### Task 14: Ask tab

**Files:** Create `src/features/ask/AskTab.tsx`; test `test/ask.test.tsx`.

**Interfaces:**
- Consumes: `useVideoSession().ask`, `seek`, `repo.addNote`, `repo.logActivity`, `<IndexCard>`, `<Mark>`, `<Timestamp>`.
- Behaviour: input placeholder "Ask this video…", `/` focuses it; submit → `ask(q)` → up to 3 result cards (amber left border, first labelled "best match", snippet with `matchedTerms` wrapped in `<Mark>`); click card → `seek(start, play)`; "＋ Save as note" → note `{kind:'ask', t:start, quote:text, text:q}`; empty result → card "No moment in this video matches that. Try other words."; 3 suggestion chips from `index.suggestions` (click → ask); footer `● on-device · {m}-min video indexed`; keyword-mode banner from Task 12. Each submitted question → `logActivity('ask')`.

- [ ] **Step 1: Write failing tests:** renders 3 hits with first "best match"; highlights matched terms; click seeks; save-as-note writes an `ask` note; empty results card; chip click asks; `/` focuses input; logs `ask` activity.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5: Manual perf check:** on a 40-min video, time from submit to render ≤ 200 ms (log `performance.now()` delta in dev builds).
- [ ] **Step 6:** Commit `feat(ui): Ask tab`.

### Task 15: Chapters tab

**Files:** Create `src/features/chapters/ChaptersTab.tsx`; test `test/chapters-tab.test.tsx`.

**Interfaces:**
- Consumes: `index.chapters`, `keyPoints` (engine), `playedFraction`, `meta.watchedRanges`, session `time`.
- Behaviour: header line `{n} chapters · {p}% watched` and Grid ▦ / List ☰ toggle (remember choice in `localStorage` in try/catch); 2-column grid of IndexCards (`CH. N`, title, keywords in Caveat joined by ", ", timestamp top-right, ✓ when `playedFraction ≥ 0.8`); current chapter (contains `time`) tilted + taped; click → seek; below grid "Now playing — key points": `keyPoints(current, …, 3)` as bullets with timestamps (in keyword mode, use the first 3 segments of the chapter). A "Transcript" link opens the transcript view scrolled to the current chapter.

- [ ] **Step 1: Write failing tests:** renders N cards with titles; current chapter has tilted class; ✓ at 80 % watched and not at 79 %; click seeks to chapter start; watched % computed over whole duration.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS. **Step 5:** Commit `feat(ui): Chapters tab`.

### Task 16: Transcript view and Notes tab with Markdown export

**Files:** Create `src/features/transcript/TranscriptView.tsx`, `src/features/notes/NotesTab.tsx`, `src/features/notes/markdown.ts`; tests `test/transcript.test.tsx`, `test/notes.test.tsx`, `test/markdown.test.ts`.

**Interfaces:**
- Produces: `toMarkdown(meta: VideoMeta, notes: Note[]): string`.
- Transcript: segments grouped under chapter headings; current segment softly highlighted and auto-scrolled (only while the user hasn't scrolled in the last 5 s); click a line → seek; text selection → floating "Highlight" button → note `{kind:'highlight', t:segment.start, quote:selection}` + `logActivity('highlight')`. Shows original-language `text`.
- Notes: editor "✍️ Note at {time}…"; `N` (panel focused, not typing) or incoming `newNote` message → pause video, focus editor stamped with that time; Enter saves (`logActivity('note')`), Shift+Enter newline; list of StickyNotes newest first with quote (italic, left rule) when present; edit in place, delete with undo toast (5 s); click timestamp → seek; buttons "Transcript" and "Export ▾" (Download .md / Copy as Markdown).
- Markdown format (exact):
```
# {title}
{channel} · https://www.youtube.com/watch?v={id}

## [{m:ss}](https://www.youtube.com/watch?v={id}&t={seconds}s)
{text}

> {quote}
```
Notes ordered by `t` ascending in export; quote block omitted when absent.

- [ ] **Step 1: Write failing tests:** `toMarkdown` exact output for 2 notes (one with quote); N key opens editor at current time and pauses; `newNote` message does the same; Enter saves and logs `note`; delete + undo restores; transcript click seeks; selecting text and clicking Highlight saves a highlight note.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS. **Step 5:** Commit `feat(ui): transcript view, notes and markdown export`.

### Task 17: Remove legacy code, README, end-to-end verification

**Files:** Delete `backend.py`, `requirements.txt`, `background.js`, `content.js`, `sidepanel.{html,js,css}`, `manifest.json`, `components/`, `utils/`, `libs/`, `fonts/`, `chroma_db/`, `README_it.md`; keep `icons/icon.png` (already copied). Rewrite `README.md`.

- [ ] **Step 1:** Run full manual checklist on the 10 videos from Task 9 with the **new** extension; every item must pass: welcome appears once; panel indexes automatically; Ask/Chapters/Notes/Transcript work; Hindi video shows Hindi text with working Ask; no-captions card; SPA navigation between 3 videos shows the right content each time; Alt+N; Markdown export pastes cleanly into Notion and Obsidian; DevTools Network panel shows no request to any host other than `www.youtube.com` / extension origin.
- [ ] **Step 2:** Time indexing of a 40-min video (model cached) — Expected ≤ 10 s; record result in the README.
- [ ] **Step 3:** Confirm with the user before deleting the legacy files (they asked for a full revamp, but deletion is irreversible outside git history — the files are committed in Task 1's initial commit, so they remain recoverable).
- [ ] **Step 4:** Delete legacy files; README: what MediaMind is, privacy promise, install (Load unpacked from `apps/extension/.output/chrome-mv3`), dev commands (`pnpm i`, `pnpm build`, `pnpm test`), roadmap waves 2–6.
- [ ] **Step 5:** `pnpm typecheck && pnpm test && pnpm build` — all PASS.
- [ ] **Step 6:** Commit `chore: remove legacy Python/Gemini MediaMind`.
