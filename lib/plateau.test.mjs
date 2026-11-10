import test from "node:test";
import assert from "node:assert/strict";
import { detectPlateau, sessionScores, PLATEAU_SESSIONS } from "./plateau.ts";

const set = (performed_on, weight, reps, set_type = "Working Set") => ({ performed_on, weight, reps, set_type });

// Days 1..n, one working set each, oldest first.
const history = (...results) => results.map(([weight, reps], index) => set(`2026-01-${String(index + 1).padStart(2, "0")}`, weight, reps));

test("not enough sessions means no verdict", () => {
  assert.equal(detectPlateau(history([60, 8], [62.5, 8], [65, 8], [65, 8])), null);
  assert.equal(PLATEAU_SESSIONS, 4);
});

test("progress in the latest session is not a plateau", () => {
  const status = detectPlateau(history([60, 8], [60, 8], [60, 8], [60, 8], [62.5, 8]));
  assert.deepEqual(status, { plateau: false, sessionsSinceBest: 0, sessions: 5 });
});

test("four sessions without beating the best is a plateau", () => {
  const status = detectPlateau(history([70, 5], [65, 5], [65, 5], [67.5, 5], [65, 5]));
  assert.deepEqual(status, { plateau: true, sessionsSinceBest: 4, sessions: 5 });
});

test("three sessions since the best is not yet a plateau", () => {
  assert.equal(detectPlateau(history([70, 5], [65, 5], [65, 5], [65, 5], [60, 5])).plateau, true);
  assert.equal(detectPlateau(history([60, 5], [70, 5], [65, 5], [65, 5], [65, 5])).plateau, false);
});

test("repeating the best result later is not progress", () => {
  const status = detectPlateau(history([70, 5], [60, 5], [60, 5], [60, 5], [70, 5]));
  assert.equal(status.plateau, true);
  assert.equal(status.sessionsSinceBest, 4);
});

test("more reps at the same weight counts as progress", () => {
  assert.equal(detectPlateau(history([60, 8], [60, 8], [60, 8], [60, 8], [60, 9])).plateau, false);
});

test("warmups are ignored and two workouts on one day are one session", () => {
  const sets = [
    ...history([60, 8], [60, 8], [60, 8], [60, 8]),
    set("2026-01-05", 100, 5, "Warmup"),
    set("2026-01-04", 40, 10),
  ];
  assert.equal(sessionScores(sets).length, 4);
  assert.equal(detectPlateau(sets), null);
});

test("bodyweight sets are scored by reps", () => {
  assert.equal(detectPlateau(history([0, 12], [0, 10], [0, 10], [0, 11], [0, 10])).plateau, true);
  assert.equal(detectPlateau(history([0, 10], [0, 10], [0, 10], [0, 10], [0, 11])).plateau, false);
});
