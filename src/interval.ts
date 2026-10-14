export const FLASH_MS = 120;

export function formatCountdown(remainingMs: number): string {
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function pickerInterval(minutes: number, seconds: number): number | null {
  if (!Number.isInteger(minutes) || !Number.isInteger(seconds) ||
    minutes < 0 || minutes > 60 || seconds < 0 || seconds > 59) return null;
  const total = minutes * 60 + seconds;
  return total >= 1 && total <= 3600 ? total * 1000 : null;
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
    throw new RangeError('Intervallet må være mellom 1 og 3600 sekunder.');
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
