import { useEffect, useState } from 'react';

/** Difference between the server clock and ours, from the latest snapshot. */
let offset = 0;

export function syncServerClock(serverNow: number, receivedAt = Date.now()): void {
  offset = serverNow - receivedAt;
}

export function serverNow(): number {
  return Date.now() + offset;
}

/** Re-renders every `ms` and returns the current server time. */
export function useServerNow(ms = 250): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function secondsLeft(deadline: number | null, now: number): number | null {
  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
