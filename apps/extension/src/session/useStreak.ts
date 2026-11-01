import { useEffect, useState } from 'react';
import { currentStreakToday, onActivity } from '../db/repo';

/** Current streak in days; refreshes whenever an ask/note/highlight is logged. */
export function useStreak(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    const refresh = () => void currentStreakToday().then((v) => live && setN(v), () => {});
    refresh();
    const off = onActivity(refresh);
    return () => {
      live = false;
      off();
    };
  }, []);
  return n;
}
