const STOP = new Set(
  (
    'a about above after again against all am an and any are aren as at be because been before being below between both but by ' +
    'can cannot could couldn did didn do does doesn doing don down during each few for from further had hadn has hasn have haven ' +
    'having he her here hers herself him himself his how i if in into is isn it its itself just let me more most my myself no nor ' +
    'not now of off on once only or other ought our ours ourselves out over own same shan she should shouldn so some such than ' +
    'that the their theirs them themselves then there these they this those through to too under until up very was wasn we were ' +
    'weren what when where which while who whom why will with won would wouldn you your yours yourself yourselves ' +
    'll re ve s t d m ' +
    // spoken fillers
    'like know gonna wanna actually um uh umm uhh okay ok right yeah'
  ).split(/\s+/),
);

// Generic words excluded from keyword extraction only (NOT from tokenize / search).
const GENERIC = new Set(
  (
    'also get gets got one two thing things way yes well basically really kind sort mean see look ' +
    'going go say said literally stuff little bit lot'
  ).split(/\s+/),
);

export function isGenericWord(w: string): boolean {
  return GENERIC.has(w);
}

export function isStopword(w: string): boolean {
  return STOP.has(w);
}

export function stem(w: string): string {
  if (!/^[a-z]+$/.test(w)) return w;
  let s = w;
  if (s.length > 4 && s.endsWith('ies')) s = s.slice(0, -3) + 'y';
  else if (s.length > 4 && s.endsWith('sses')) s = s.slice(0, -2);
  else if (s.length > 4 && /(ch|sh|x|z)es$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  return s;
}

export type Tok = { stem: string; surface: string };

/** Tokens grouped into chunks split at punctuation; stopwords are kept as null gaps. */
export function tokenizeChunks(s: string): (Tok | null)[][] {
  const chunks = s.toLowerCase().split(/[^\p{L}\p{M}\p{N}'’\s-]+|\n/u);
  const out: (Tok | null)[][] = [];
  for (const c of chunks) {
    const words = c.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
    if (!words.length) continue;
    out.push(words.map((w) => (STOP.has(w) || w.length < 2 ? null : { stem: stem(w), surface: w })));
  }
  return out;
}

export function tokenize(s: string): string[] {
  return tokenizeChunks(s).flat().filter((t): t is Tok => t !== null).map((t) => t.stem);
}
