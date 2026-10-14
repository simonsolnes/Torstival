import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FLASH_MS, formatCountdown, pickerInterval, startFlashes } from './interval.ts';

test('countdown uses minutes and seconds, rounding up without going negative', () => {
  assert.equal(formatCountdown(300_000), '5:00');
  assert.equal(formatCountdown(60_001), '1:01');
  assert.equal(formatCountdown(60_000), '1:00');
  assert.equal(formatCountdown(59_001), '1:00');
  assert.equal(formatCountdown(1), '0:01');
  assert.equal(formatCountdown(-50), '0:00');
});

function fakeClock() {
  let now = 0;
  let id = 0;
  const tasks = new Map<number, { callback: () => void; at: number }>();
  return {
    now: () => now,
    schedule(callback: () => void, delay: number) {
      tasks.set(++id, { callback, at: now + delay });
      return id;
    },
    cancel(handle: unknown) { tasks.delete(handle as number); },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const next = [...tasks.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        now = next[1].at;
        tasks.delete(next[0]);
        next[1].callback();
      }
      now = end;
    },
    stall(ms: number) {
      now += ms;
      const due = [...tasks.entries()].filter(([, task]) => task.at <= now);
      for (const [key, task] of due) { tasks.delete(key); task.callback(); }
    },
    pending: () => tasks.size,
  };
}

test('picker supports five minutes, seconds-only intervals, and the one-hour limit', () => {
  for (const [minutes, seconds] of [[0, 0], [-1, 30], [0, 60], [60, 1], [61, 0], [0, 1.5], [NaN, 1], [0, Infinity]]) {
    assert.equal(pickerInterval(minutes, seconds), null);
  }
  assert.equal(pickerInterval(5, 0), 300_000);
  assert.equal(pickerInterval(0, 1), 1000);
  assert.equal(pickerInterval(0, 30), 30_000);
  assert.equal(pickerInterval(1, 30), 90_000);
  assert.equal(pickerInterval(60, 0), 3_600_000);
});

test('waits one interval, flashes briefly, and repeats on the original cadence', () => {
  const clock = fakeClock();
  const events: [number, boolean][] = [];
  const stop = startFlashes(2000, active => events.push([clock.now(), active]), clock);
  clock.advance(1999);
  assert.deepEqual(events, []);
  clock.advance(1 + FLASH_MS);
  assert.deepEqual(events, [[2000, true], [2120, false]]);
  clock.advance(1880);
  assert.deepEqual(events.at(-1), [4000, true]);
  stop();
  assert.equal(clock.pending(), 0);
  assert.deepEqual(events.at(-1), [4000, false]);
  clock.advance(10000);
  assert.equal(events.length, 4);
});

test('stop before the first flash and restart create a fresh interval', () => {
  const clock = fakeClock();
  const events: boolean[] = [];
  const stop = startFlashes(1000, active => events.push(active), clock);
  clock.advance(500);
  stop();
  clock.advance(2000);
  assert.deepEqual(events, [false]);
  const stopAgain = startFlashes(1000, active => events.push(active), clock);
  clock.advance(999);
  assert.deepEqual(events, [false]);
  clock.advance(1);
  assert.deepEqual(events, [false, true]);
  stopAgain();
});

test('a delayed callback skips missed flashes and preserves the next deadline', () => {
  const clock = fakeClock();
  const events: [number, boolean][] = [];
  const stop = startFlashes(1000, active => events.push([clock.now(), active]), clock);
  clock.stall(3500);
  assert.deepEqual(events, [[3500, true]]);
  clock.advance(500);
  assert.deepEqual(events, [[3500, true], [3620, false], [4000, true]]);
  stop();
});

test('rejects invalid intervals before scheduling', () => {
  const clock = fakeClock();
  for (const interval of [0, -1, 999, NaN, Infinity, 3_600_001]) {
    assert.throws(() => startFlashes(interval, () => {}, clock), RangeError);
  }
  assert.equal(clock.pending(), 0);
});

test('countdown shares the actual pulse deadline, including after a stall', () => {
  const clock = fakeClock();
  const deadlines: number[] = [];
  const stop = startFlashes(1000, () => {}, clock, next => deadlines.push(next));
  assert.deepEqual(deadlines, [1000]);
  clock.advance(1000);
  assert.deepEqual(deadlines, [1000, 2000]);
  clock.stall(2500);
  assert.deepEqual(deadlines, [1000, 2000, 4000]);
  stop();
});
