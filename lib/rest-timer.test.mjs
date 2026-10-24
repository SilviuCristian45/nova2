import assert from "node:assert/strict";
import test from "node:test";
import { clampRest, formatClock, remainingSeconds } from "./rest-timer.ts";

test("remaining time counts up to the end timestamp and never goes negative", () => {
  assert.equal(remainingSeconds(90_000, 0), 90);
  assert.equal(remainingSeconds(90_000, 89_001), 1);
  assert.equal(remainingSeconds(90_000, 90_000), 0);
  assert.equal(remainingSeconds(90_000, 120_000), 0);
});

test("clock format and duration limits", () => {
  assert.equal(formatClock(90), "1:30");
  assert.equal(formatClock(5), "0:05");
  assert.equal(clampRest(5), 15);
  assert.equal(clampRest(10_000), 600);
  assert.equal(clampRest(NaN), 90);
});
