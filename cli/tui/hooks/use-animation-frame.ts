import { useEffect, useState } from "react";

/**
 * Returns a monotonically increasing `time` value (in ms) that updates
 * at roughly `intervalMs` cadence. Pass `null` to pause the clock.
 *
 * Designed to drive spinner / shimmer animations in terminal UI.
 */
export function useAnimationFrame(intervalMs: number | null = 50): number {
  const [time, setTime] = useState(0);

  useEffect(() => {
    if (intervalMs === null) return;

    const id = setInterval(() => {
      setTime((prev) => prev + intervalMs);
    }, intervalMs);

    return () => clearInterval(id);
  }, [intervalMs]);

  return time;
}
