# MediaMind — Wave 1 (Foundation) Design

Date: 2026-10-31 · Status: reviewed, awaiting user approval

## 1. Intent and why

MediaMind today is a Chrome side panel for YouTube that sends transcripts to a local
Flask server, which calls Gemini. Users must run Python and supply an API key, so
nobody outside the author can use it.

The revamp turns it into a **NoteGPT-style study tool that runs entirely in the browser**:
free, private, no account, no API key, no server, no LLM. NoteGPT, Eightify and Glasp all
charge because they pay for LLM calls; local note-taking extensions (Keepr, NoteFrames) are
just notepads. MediaMind sits in between: real study features (ask, chapters, notes,
flashcards, mind maps, streaks) built from transcript processing plus one small on-device
embedding model.

Target users: students and self-learners, with a deliberate Indian flavour (welcome screen,
later a Hindi/regional UI), but the product works for anyone.

## 2. The whole roadmap (context only — this doc specifies Wave 1)

| Wave | Contents |
|---|---|
| **1 Foundation** | New extension codebase, transcript capture, local index, welcome + setup, Ask, Chapters, Transcript, Notes, basic streak in header |
| 2 Learning loop | Flashcards + spaced repetition, Today/home screen, goal-based streak, weekly recap + streak freeze, study timer |
| 3 Visual & sharing | Mind map tab, quote cards, read mode, glossary, quiz-me |
| 4 YouTube helpers | Focus mode, SponsorBlock skip |
| 5 Website | Landing page, Library (reads extension data), search across all videos, playlists as courses |
| 6 Expansion | Hindi/regional UI, sites beyond YouTube |

Each wave gets its own design doc. Wave 1 must leave room for the later waves (data model,
tab bar, theming) but must not build them.

## 3. Goals, non-goals, anti-goals

**Goals (Wave 1)**
- Install from a zip / "Load unpacked" and it works on any captioned YouTube video with zero setup.
- Index a 40-minute captioned video in ≤ 10 s on a mid-range laptop (after the model is cached), and answer an Ask query in ≤ 200 ms.
- Ship the agreed visual design: Study Desk theme, Index Card inner cards, Indian welcome screen.
- Replace the old code completely; no Python, no backend.

**Non-goals (Wave 1)**
- Flashcards, mind map, Today screen, quizzes, website, any wave 2–6 feature.
- Videos without captions (show a friendly empty state; no speech-to-text).
- Firefox/Safari. Chrome first; Edge should work for free since it's Chromium.
- Cloud sync, accounts, analytics.

**Anti-goals (would be a failure even if it "works")**
- Any user data (transcripts, notes, queries) leaving the device. The only network traffic allowed is to youtube.com, which the user is already on.
- Needing an API key, sign-up, or a running server.
- A first run that feels broken or slow: long spinners with no feedback, a blank panel on videos without captions, a crash on YouTube's in-page navigation.
- Pretending to be an AI chatbot. Ask returns *moments in the video*, never generated prose.

## 4. Decisions already made

### 4.1 Approach and tech
- **No LLM.** Classic text processing + a small embedding model. (User decision.)
- **Stack:** TypeScript, **WXT** (extension framework, Manifest V3), **React** for the side panel. *(Claude's call; user said any language is fine.)*
- **Embedding model:** `Xenova/all-MiniLM-L6-v2` (quantized, ~23 MB) via **transformers.js**, **bundled inside the extension** so nothing is fetched from Hugging Face at runtime. *(Claude's call — keeps the "nothing leaves your device" promise literal.)*
- **Storage:** IndexedDB (via Dexie) for videos, segments, embeddings, notes, highlights, activity log. `chrome.storage.local` for settings and the onboarding flag.
- **Repo layout** *(Claude's call)*: monorepo with `apps/extension` now, `apps/web` in wave 5, and `packages/engine` (pure TS: segmentation, keywords, chapters, search) shared between them. The old files (`backend.py`, `sidepanel.*`, `components/`, `chroma_db/`, `libs/`, etc.) are deleted at the end of Wave 1 once the new extension reaches parity. Until then they stay untouched.

### 4.2 Visual design (approved in the visual companion; mockups in `.superpowers/brainstorm/`)
- **Theme: Study Desk.** Paper `#faf6ee`, ink `#2b2620`, rule lines `#e6dccb`, muted `#8a7d6b`, amber `#d9a441`, rust `#b4532a`, leaf `#4f7a4a`, marigold `#f2a516`, kumkum `#a8323e`. Serif body (Georgia / Iowan Old Style), system sans for UI chrome, monospace for timestamps.
- **Header:** logo "M" tile, "MediaMind", **🔥 N-day streak** pill on the right, on every screen.
- **Tab bar:** Ask · Chapters · Notes · Cards · Map. In Wave 1, Cards and Map are visible but show a "coming soon" index card (keeps the layout final; they ship in waves 2–3).
- **Inner cards: Index Card style** (`inner-cards-v1.html`, option A):
  - Chapter cards: ruled-paper background, red margin line, small "CH. N" label, bold serif title, keywords in a handwritten font, timestamp top-right, ✓ when watched; the **current chapter** is tilted ~-1.2° with a strip of marigold tape.
  - Ask results: paper card, amber left border, highlighter-style `<mark>` (underline-gradient), small "best match" label.
  - Notes: yellow sticky-note cards, slight rotation, handwritten font, timestamp on top.
  - Handwritten font is bundled locally (e.g. Caveat, OFL) — no Google Fonts request.
- **Welcome screen (first open only)** — approved as-is from `full-design-v1.html`:
  - Marigold/orange toran (garland) along the top edge, slowly rotating 16-petal rangoli in the centre.
  - "Hello" cycling every 1.2 s through: नमस्ते (Hindi), வணக்கம் (Tamil), নমস্কার (Bengali), నమస్కారం (Telugu), नमस्कार (Marathi), ਸਤ ਸ੍ਰੀ ਅਕਾਲ (Punjabi), નમસ્તે (Gujarati), ನಮಸ್ಕಾರ (Kannada), നമസ്കാരം (Malayalam), Hello (English), with the language name below in small caps.
  - Tagline "Turn any YouTube video into notes, chapters & flashcards." + "Free forever · no account · nothing leaves your browser".
  - **Skip →** pill top-right (always active). **Continue →** bottom button fills left-to-right and becomes active after **2.5 s**.
  - Respect `prefers-reduced-motion`: no spin, crossfade instead of slide, Continue active immediately.
- **Setup (2 steps, after welcome; Skip jumps past both with defaults):**
  1. "What brings you here?" — Studying / Work & learning / Curiosity (stored; used in later waves to pick default tab).
  2. Daily goal — 1 video / 10 cards / 20 min (stored; streak rules use it from Wave 2).

### 4.3 Features in Wave 1

**Transcript capture**
- Content script on `youtube.com/watch*` detects the video ID, including YouTube's in-page (SPA) navigation (`yt-navigate-finish` event, URL fallback).
- Reads the caption track list from the page's player response, prefers a manual track in the user's UI language, then English, then the default track, then auto-generated. Fetches it as timed JSON and turns it into `{start, dur, text}` cues.
- Fallback if that fails: open YouTube's own "Show transcript" panel programmatically and read it from the DOM.
- No captions → index-card empty state: "This video has no captions, so MediaMind can't read it yet." No error spew.
- Also reads the creator's chapters (from the description timestamps or the player's chapter markers) when present.

**Indexing (packages/engine, runs in a Web Worker so the UI never freezes)**
- Group cues into **segments** of ~25–40 s, breaking at cue boundaries (auto-captions often have no punctuation, so segments are time-based, not sentence-based).
- Embed each segment with MiniLM; also build a keyword (BM25) index.
- Extract keywords per segment and per chapter (TF-IDF against the video itself, stop-words removed, prefer multi-word noun phrases).
- Cache everything in IndexedDB keyed by video ID + caption track; reopening a video is instant.
- Progress UI while indexing: a ruled index card with "Reading transcript… → Finding chapters… → Ready", plus a progress bar.

**Ask tab**
- Search box ("Ask this video…"), `/` focuses it.
- **Hybrid search**: cosine similarity on embeddings + BM25, merged; return the **top 3 non-overlapping** segments.
- Each result: timestamp, snippet with query terms highlighted, "best match" on the first. Click the card → video seeks there and plays. Actions: **＋ Save as note** (creates a note with the quote). "＋ Make flashcard" is hidden until Wave 2.
- **Suggested questions**: 3 chips generated from top keywords ("What is <keyword>?", "Why <keyword>?").
- Footer: "● on-device · 40-min video indexed".

**Chapters tab**
- Use creator chapters if they exist; otherwise **auto-chapters**: TextTiling-style topic segmentation over segment embeddings (split where similarity between neighbouring windows dips), min chapter 2 min, roughly 4–10 chapters per hour.
- Auto-chapter title = its top 2–3 keywords, title-cased (e.g. "Backpropagation · Chain Rule"). We do not invent prose titles.
- 2-column grid of Index Cards (list view toggle). Watched ✓ (chapter counts as watched once ≥ 80 % of it has been played), current chapter tilted with tape, live-updating as the video plays.
- Below the grid: "Now playing — key points": 2–3 most central segments of the current chapter, as bullets with timestamps.

**Transcript view** (reached from Notes tab's "Transcript" button and from Chapters)
- Full transcript grouped by chapter, current line auto-scrolls and is softly highlighted, click any line to seek.
- Select text → "Highlight" → saved as a highlight-note.

**Notes tab**
- Editor at top: "✍️ Note at <current time>…". Press **N** (panel focused) or **Alt+N** (anywhere on the YouTube page, via `chrome.commands`) → pauses video, focuses editor stamped with the current second.
- Notes list: sticky-note cards, newest first, quote shown when the note came from Ask or a highlight. Edit / delete. Click timestamp → seek.
- **Export**: Markdown download + "Copy as Markdown". The Markdown format must paste cleanly into Notion and Obsidian (headings, `[mm:ss](youtube link with &t=)` links, quotes as `>`).

**Streak (basic, Wave 1)**
- A day counts if the user did any study action (indexed a video, asked, wrote a note, highlighted). Header shows consecutive days. Wave 2 replaces the rule with the daily goal and adds freezes; the activity log written now must be enough for that.

**Non-YouTube tab**
- Panel shows a simple index card: "Open a YouTube video to start", plus the last 3 videos (click → opens them). The full Today screen is Wave 2.

### 4.4 Data model (must survive into later waves)
- `videos` (id, title, channel, duration, captionTrack, indexedAt, lastOpenedAt, watchedRanges)
- `segments` (videoId, idx, start, end, text, indexText, lang, embedding Float32Array, keywords)
- `chapters` (videoId, idx, start, end, title, source: creator|auto, keywords)
- `notes` (id, videoId, t, text, quote?, kind: note|highlight|ask, createdAt, updatedAt)
- `activity` (date YYYY-MM-DD, counts by action type)
- `settings` (onboardingDone, purpose, dailyGoal, theme)
- Include a `schemaVersion` and Dexie migrations from day one.

## 5. Constraints
- Manifest V3; permissions limited to `sidePanel`, `storage`, `scripting`, `activeTab`, `commands`, host `https://www.youtube.com/*`. Remove the old `localhost` host permission.
- No remote code, no remote fonts, no CDN scripts (Chrome Web Store policy + privacy promise). The model weights and ONNX/WASM runtime ship in the package. WASM requires `'wasm-unsafe-eval'` in the extension CSP.
- Total package size target ≤ 40 MB.
- YouTube's markup and caption endpoints change without notice: keep all YouTube-specific code in one module behind a small interface, so a breakage is a one-file fix.

## 6. Left to the builder
- Exact segmentation thresholds, chapter-splitting tuning, BM25/embedding merge weights (tune on 5–10 real videos: a lecture, a podcast, a tutorial, a Hindi-English mixed video).
- Component structure, state management, test setup.
- Exact copy for empty/error states, as long as it's in the Index Card voice.
- How the side panel talks to the content script (messaging vs. ports).

## 7. Calls made after builder check (Claude's calls — user can override)

**When indexing happens.** Indexing runs automatically when the side panel is open on a
watch page (and when the user navigates to a new video with it open). With the panel closed,
nothing is indexed: no offscreen document, no CPU spent on music in background tabs. The
worker lives in the side panel. The content script always tracks playback cheaply
(`watchedRanges` written to IndexedDB through the background) so chapter ✓ stays accurate even
when the panel was closed. **Indexing does not count toward the streak**; only deliberate
actions do (ask, note, highlight, and later cards/goal). **Alt+N** with the panel closed opens
the panel (the command is a user gesture, so `chrome.sidePanel.open` is allowed) and focuses
the note editor at the current second.

**Caption capture path.** Primary path: a small main-world script that observes the player's
own timedtext request/response (the player already holds any proof-of-origin token), so we
reuse what YouTube fetched instead of making our own request. If no captions were loaded
(user has CC off), toggle captions programmatically and restore the user's setting.
Secondary: read the "Show transcript" panel from the DOM, opened with the panel
visually hidden (off-screen CSS) and closed afterwards, so there is no visible flicker.
All of this lives in the single YouTube module (§5). The builder should check on 10 videos
in week 1 which path actually carries the load, and report back.

**Non-English videos (user decision: option b).** The embedding model stays English-only
(MiniLM, bundled). When the chosen caption track is not English, also fetch YouTube's English
auto-translation of that track (same caption request with `tlang=en`, captured the same way
as §7 above) and use it for **embeddings, keywords and auto-chapter titles**. The UI (transcript,
snippets, notes quotes) shows the **original-language** text. Each segment therefore stores
both `text` (original) and `indexText` (English); for English tracks they are the same.
Query-time: the user's question is embedded as-is (users on Hindi videos will usually type in
English/Hinglish; that is accepted). BM25 runs over both texts so exact Hindi words still match.
Builder's own fallback (not the user's explicit decision): if no translation is available,
run Ask on BM25 over the original text and build chapters from creator chapters or evenly
timed blocks, and show a small "basic search for this language" note.
Multilingual model (option a) is deferred; revisit if users ask.

## 8. Open questions
- None.
