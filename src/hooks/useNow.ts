import { useEffect, useState } from 'react';

/**
 * The current time, for counting down to `deadline`: updated every `interval` ms and right
 * after the deadline passes. Not updated while there is no deadline.
 */
export function useNow(deadline: number | null, interval: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline === null) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, interval);
    const atDeadline = setTimeout(tick, Math.max(0, deadline - Date.now()) + 100);
    return () => {
      clearInterval(timer);
      clearTimeout(atDeadline);
    };
  }, [deadline, interval]);

  return now;
}
