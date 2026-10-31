import assert from "node:assert/strict";
import { test } from "node:test";
import { idleTimer, pauseTimer, startTimer, timerSeconds, parseTimer } from "./workout-timer.ts";
import { restoreDraft } from "./workout-draft.ts";

test("M6: elapsed time comes from timestamps, so a throttled background tab loses nothing", () => {
  const started = startTimer(idleTimer, 1_000);
  // The old code added 1 per interval tick; a tab that only ticked 3 times in a minute would show 00:03.
  assert.equal(timerSeconds(started, 61_000), 60);
});

test("pausing keeps the elapsed time and resuming continues from it", () => {
  let timer = startTimer(idleTimer, 0);
  timer = pauseTimer(timer, 30_000);
  assert.equal(timerSeconds(timer, 90_000), 30); // paused: does not move
  timer = startTimer(timer, 100_000);
  assert.equal(timerSeconds(timer, 110_000), 40);
  assert.equal(timerSeconds(startTimer(timer, 120_000), 125_000), 55); // starting twice is a no-op
});

test("the timer survives in the draft", () => {
  const timer = pauseTimer(startTimer(idleTimer, 0), 42_000);
  const stored = JSON.stringify({ sets: [{ id: "a" }], cardio: [], mode: "strength", timer });
  const restored = restoreDraft({ sets: [], cardio: [], mode: "strength", timer: idleTimer }, stored);
  assert.equal(timerSeconds(restored.timer, 999_999), 42);
  assert.deepEqual(parseTimer({ elapsedMs: -5, startedAt: "x" }), idleTimer); // junk falls back to idle
});
