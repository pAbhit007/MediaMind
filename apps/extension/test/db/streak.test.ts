import { describe, it, expect } from 'vitest';
import { currentStreak } from '../../src/db/streak';

describe('currentStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(currentStreak(['2026-10-29', '2026-10-30', '2026-10-31'], '2026-10-31')).toBe(3);
  });
  it('counts a streak ending yesterday', () => {
    expect(currentStreak(['2026-10-29', '2026-10-30'], '2026-10-31')).toBe(2);
  });
  it('resets on a gap', () => {
    expect(currentStreak(['2026-10-27', '2026-10-30'], '2026-10-31')).toBe(1);
    expect(currentStreak(['2026-10-27'], '2026-10-31')).toBe(0);
  });
  it('is 0 for no dates', () => {
    expect(currentStreak([], '2026-10-31')).toBe(0);
  });
  it('handles month and year boundaries and duplicates', () => {
    expect(currentStreak(['2026-12-31', '2027-01-01', '2027-01-01'], '2027-01-01')).toBe(2);
  });
});
