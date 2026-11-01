function shift(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Consecutive active days ending today, or ending yesterday if today has no activity yet. */
export function currentStreak(activeDates: string[], today: string): number {
  const set = new Set(activeDates);
  let day = set.has(today) ? today : shift(today, -1);
  let n = 0;
  while (set.has(day)) {
    n++;
    day = shift(day, -1);
  }
  return n;
}

/** Local-time YYYY-MM-DD. */
export function localDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
