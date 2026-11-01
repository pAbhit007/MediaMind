import type { Cue, Segment } from './types';

export const SEGMENT_MIN = 25,
  SEGMENT_MAX = 40;

const SENTENCE_END = /[.?!]["')\]]?$/;

/** Cue end, robust to dur 0 (ASR): max(start+dur, next cue start). */
function cueEnd(cues: Cue[], i: number): number {
  const c = cues[i];
  const e = c.start + c.dur;
  return i + 1 < cues.length ? Math.max(e, cues[i + 1].start) : e;
}

export function segmentCues(cues: Cue[], lang: string, translated?: Cue[]): Omit<Segment, 'keywords'>[] {
  const groups: { from: number; to: number }[] = []; // [from, to) cue indices
  let from = 0;
  for (let i = 0; i < cues.length; i++) {
    const segStart = cues[from].start;
    const len = cueEnd(cues, i) - cues[i].start;
    if (i > from) {
      const withCue = cueEnd(cues, i) - segStart;
      const cur = cues[i].start - segStart; // length before adding cue i
      // close first if adding would overflow the max (and we're past the min),
      // or if this cue alone exceeds the max and must stand alone
      if ((withCue > SEGMENT_MAX && cur >= SEGMENT_MIN) || len > SEGMENT_MAX) {
        groups.push({ from, to: i });
        from = i;
      }
    }
    const length = cueEnd(cues, i) - cues[from].start;
    if (length >= SEGMENT_MAX || (length >= SEGMENT_MIN && SENTENCE_END.test(cues[i].text))) {
      groups.push({ from, to: i + 1 });
      from = i + 1;
    }
  }
  if (from < cues.length) groups.push({ from, to: cues.length });

  const segs: Omit<Segment, 'keywords'>[] = groups.map((g, idx) => {
    const text = cues
      .slice(g.from, g.to)
      .map((c) => c.text)
      .join(' ');
    return {
      idx,
      start: cues[g.from].start,
      end: cueEnd(cues, g.to - 1),
      text,
      indexText: text,
      lang,
    };
  });

  if (translated) {
    const parts: string[][] = segs.map(() => []);
    let s = 0;
    // sort by start so the forward-only segment pointer is valid for unsorted input
    for (const t of [...translated].sort((a, b) => a.start - b.start)) {
      const mid = t.start + t.dur / 2;
      if (!segs.length || mid < segs[0].start) continue;
      while (s < segs.length - 1 && mid >= segs[s].end) s++;
      parts[s].push(t.text);
    }
    segs.forEach((seg, i) => (seg.indexText = parts[i].length ? parts[i].join(' ') : seg.text));
  }
  return segs;
}
