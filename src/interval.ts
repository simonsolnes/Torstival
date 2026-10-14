export const FLASH_MS = 120;

export function formatCountdown(remainingMs: number): string {
  return (Math.ceil(Math.max(0, remainingMs) / 100) / 10).toFixed(1);
}

export function parseInterval(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const seconds = Number(normalized);
  return Number.isFinite(seconds) && seconds >= 1 && seconds <= 3600
    ? Math.round(seconds * 1000)
    : null;
}

export type Clock = {
  now: () => number;
  schedule: (callback: () => void, delay: number) => unknown;
  cancel: (handle: unknown) => void;
};

// Keep an absolute deadline so callback delays do not accumulate as drift.
// If the event loop stalls, skip missed beats instead of flashing in a burst.
export function startFlashes(intervalMs: number, onFlash: (active: boolean) => void, clock: Clock, onDeadline: (deadline: number) => void = () => {}) {
  if (!Number.isFinite(intervalMs) || intervalMs < 1000 || intervalMs > 3_600_000) {
    throw new RangeError('Interval must be between 1 and 3600 seconds.');
  }
  let stopped = false;
  let deadline = clock.now() + intervalMs;
  onDeadline(deadline);
  let flashEnd: unknown;
  let nextBeat: unknown;

  const tick = () => {
    if (stopped) return;
    onFlash(true);
    flashEnd = clock.schedule(() => {
      if (!stopped) onFlash(false);
    }, FLASH_MS);
    deadline += (Math.floor(Math.max(0, clock.now() - deadline) / intervalMs) + 1) * intervalMs;
    onDeadline(deadline);
    nextBeat = clock.schedule(tick, Math.max(0, deadline - clock.now()));
  };

  nextBeat = clock.schedule(tick, intervalMs);
  return () => {
    stopped = true;
    clock.cancel(nextBeat);
    if (flashEnd !== undefined) clock.cancel(flashEnd);
    onFlash(false);
  };
}
