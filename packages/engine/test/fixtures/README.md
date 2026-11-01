# Caption fixtures (synthetic)

YouTube timedtext now needs a proof-of-origin token (the unauthenticated fetch returns HTTP 429), so these
are hand-built in YouTube's json3 format (`events[].tStartMs/dDurationMs/segs[].utf8`, empty events,
`"\n"` segs, `[Music]`/`[Applause]`, `&#39;`/`&amp;`, `>>`, ASR rolling duplicates).

- lecture-en: ~40 min, cue every 3-5 s, 8 neural-network topics (~5 min each)
- podcast-en-asr: ~10 min, lowercase unpunctuated ASR style
- hindi / hindi-tlang-en: ~5 min Devanagari original + English translation with offset timings

Regenerate: write a small seeded (LCG) Node script that emits the above shapes; replace with real captures
(DevTools -> Network -> `timedtext` request on a captioned video) when available.
