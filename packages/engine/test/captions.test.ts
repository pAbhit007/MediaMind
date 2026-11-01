import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseJson3, cleanCueText, pickTrack, parseDescriptionChapters } from '../src/captions';
import type { CaptionTrack } from '../src/types';

const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json3.json`, import.meta.url), 'utf8'));

describe('parseJson3', () => {
  it('parses json3 events into cues', () => {
    const raw = fx('lecture-en');
    const cues = parseJson3(raw);
    expect(cues.length).toBeGreaterThan(300);
    const first = raw.events.find((e: any) => e.segs?.some((s: any) => s.utf8.trim()));
    expect(cues[0].start).toBeCloseTo(first.tStartMs / 1000);
    expect(cues[0].dur).toBeGreaterThan(0);
    for (const c of cues) expect(c.text.length).toBeGreaterThan(0);
    for (let i = 1; i < cues.length; i++) expect(cues[i].start).toBeGreaterThanOrEqual(cues[i - 1].start);
    expect(cues[cues.length - 1].start).toBeGreaterThan(2300);
  });

  it('parses every fixture cleanly', () => {
    for (const n of ['lecture-en', 'podcast-en-asr', 'hindi', 'hindi-tlang-en']) {
      const cues = parseJson3(fx(n));
      expect(cues.length).toBeGreaterThan(50);
      cues.forEach((c, i) => {
        expect(c.text).not.toMatch(/\[Music\]|\[Applause\]|\[Laughter\]|>>|&#|&amp;|\n|  /);
        if (i > 0) {
          expect(c.text).not.toBe(cues[i - 1].text);
          expect(c.text.startsWith(cues[i - 1].text)).toBe(false);
        }
      });
    }
  });

  it('removes rolling-caption overlap (prefix repeats, aAppend newlines)', () => {
    const cues = parseJson3({
      events: [
        { tStartMs: 0, dDurationMs: 3000, segs: [{ utf8: 'hello there' }] },
        { tStartMs: 1500, dDurationMs: 10, aAppend: 1, segs: [{ utf8: '\n' }] },
        { tStartMs: 1600, dDurationMs: 4000, segs: [{ utf8: 'hello there\nhow are you' }] },
        { tStartMs: 3000, aAppend: 1, segs: [{ utf8: '\n' }] },
        { tStartMs: 3100, dDurationMs: 4000, segs: [{ utf8: 'how are you\ndoing today' }] },
        { tStartMs: 8000, dDurationMs: 2000, segs: [{ utf8: 'doing today fine' }] },
      ],
    });
    expect(cues.map((c) => c.text)).toEqual(['hello there', 'how are you', 'doing today', 'fine']);
  });

  it('handles malformed input', () => {
    expect(parseJson3(null)).toEqual([]);
    expect(parseJson3({})).toEqual([]);
    expect(parseJson3({ events: [{ tStartMs: 0 }] })).toEqual([]);
  });

  it('drops empty cues, sorts, and merges rolling duplicates', () => {
    const cues = parseJson3({
      events: [
        { tStartMs: 5000, dDurationMs: 1000, segs: [{ utf8: 'second' }] },
        { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'it&#39;s the ' }, { utf8: 'chain' }] },
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: '\n' }] },
        { tStartMs: 2000, dDurationMs: 1000 },
        { tStartMs: 2500, dDurationMs: 1000, segs: [{ utf8: '[Music]' }] },
        { tStartMs: 3000, dDurationMs: 2000, segs: [{ utf8: "it's the chain" }] },
      ],
    });
    expect(cues).toEqual([
      { start: 0, dur: 5, text: "it's the chain" },
      { start: 5, dur: 1, text: 'second' },
    ]);
  });
});

describe('cleanCueText', () => {
  it('cleans auto-caption noise', () => {
    expect(cleanCueText('[Music] it&#39;s >> the\nchain  rule')).toBe("it's the chain rule");
    expect(cleanCueText('[Applause]')).toBe('');
    expect(cleanCueText('a &amp; b &quot;c&quot; &lt;d&gt; &#x41;&#66;')).toBe('a & b "c" <d> AB');
    expect(cleanCueText('so (laughs) yes')).toBe('so yes');
  });
  it('keeps multi-word parentheticals', () => {
    expect(cleanCueText('the loss (also called cost) drops')).toBe('the loss (also called cost) drops');
    expect(cleanCueText('[Music playing] hi')).toBe('[Music playing] hi');
  });
});

const t = (languageCode: string, kind: 'asr' | 'manual'): CaptionTrack => ({
  languageCode, kind, name: `${languageCode}-${kind}`, baseUrl: 'u', isTranslatable: true,
});

describe('pickTrack', () => {
  it('prefers manual in UI lang, then manual en, then default, then asr', () => {
    const cases: [CaptionTrack[], string, string | null][] = [
      [[t('en', 'asr'), t('en', 'manual'), t('hi', 'manual')], 'hi', 'hi-manual'],
      [[t('hi', 'asr'), t('fr', 'manual'), t('en', 'manual')], 'de', 'en-manual'],
      [[t('hi', 'asr'), t('fr', 'manual'), t('de', 'manual')], 'es', 'fr-manual'],
      [[t('en', 'asr'), t('hi', 'asr')], 'hi', 'hi-asr'],
      [[t('fr', 'asr'), t('en', 'asr')], 'de', 'en-asr'],
      [[t('fr', 'asr'), t('de', 'asr')], 'es', 'fr-asr'],
      [[], 'en', null],
    ];
    for (const [tracks, ui, want] of cases) expect(pickTrack(tracks, ui)?.name ?? null).toBe(want);
  });
  it('matches UI lang by base code', () => {
    expect(pickTrack([t('en-US', 'manual'), t('hi', 'asr')], 'en-GB')?.name).toBe('en-US-manual');
  });
});

describe('parseDescriptionChapters', () => {
  it('parses creator chapters', () => {
    const ch = parseDescriptionChapters('0:00 Intro\n2:15 Gradient descent\n1:02:03 Recap', 4000);
    expect(ch.map((c) => c.start)).toEqual([0, 135, 3723]);
    expect(ch[2].end).toBe(4000);
    expect(ch[0].end).toBe(135);
    expect(ch.map((c) => c.title)).toEqual(['Intro', 'Gradient descent', 'Recap']);
    expect(ch.map((c) => c.idx)).toEqual([0, 1, 2]);
    expect(ch.every((c) => c.source === 'creator')).toBe(true);
  });
  it('returns [] if fewer than 3 timestamps or first is not 0:00', () => {
    expect(parseDescriptionChapters('0:00 Intro\n2:15 Two', 4000)).toEqual([]);
    expect(parseDescriptionChapters('0:05 A\n2:15 B\n3:00 C', 4000)).toEqual([]);
    expect(parseDescriptionChapters('no stamps here', 4000)).toEqual([]);
  });
  it('tolerates bullets and dashes in lines', () => {
    const ch = parseDescriptionChapters('Watch!\n- 0:00 - Intro\n• 1:00 – Mid\n2:00: End', 300);
    expect(ch.map((c) => c.title)).toEqual(['Intro', 'Mid', 'End']);
  });
});
