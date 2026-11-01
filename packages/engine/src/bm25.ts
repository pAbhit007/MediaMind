const K1 = 1.2;
const B = 0.75;

export class Bm25 {
  private tf: Map<string, number>[];
  private len: number[];
  private df = new Map<string, number>();
  private avg: number;

  constructor(docs: string[][]) {
    this.tf = docs.map((d) => {
      const m = new Map<string, number>();
      for (const t of d) m.set(t, (m.get(t) ?? 0) + 1);
      return m;
    });
    this.len = docs.map((d) => d.length);
    for (const m of this.tf) for (const t of m.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    this.avg = docs.length ? this.len.reduce((a, b) => a + b, 0) / docs.length || 1 : 1;
  }

  score(query: string[]): Float64Array {
    const n = this.tf.length;
    const out = new Float64Array(n);
    for (const t of new Set(query)) {
      const df = this.df.get(t);
      if (!df) continue;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      for (let i = 0; i < n; i++) {
        const f = this.tf[i].get(t);
        if (!f) continue;
        out[i] += (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * this.len[i]) / this.avg));
      }
    }
    return out;
  }
}
