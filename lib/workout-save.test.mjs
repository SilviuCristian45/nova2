import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidWorkoutDate, saveWorkoutArgs, workoutSplit } from "./workout-save.ts";

const s = (split, rir = 2) => ({ split, exercise: "Bench", setNumber: 1, reps: 5, weight: 80, rir, setType: "Working Set", notes: "" });

test("M2: the saved split is the one of the sets (first set), not the picker value at Finish", () => {
  assert.equal(workoutSplit([s("Pull"), s("Push")], "Legs"), "Pull");
  assert.equal(workoutSplit([], "Legs"), "Legs");
});

test("M3: the client's local date is validated, not derived from UTC", () => {
  assert.ok(isValidWorkoutDate("2026-10-31", "2026-10-31"));
  assert.ok(isValidWorkoutDate("2026-11-01", "2026-10-31")); // timezones ahead of the server
  assert.ok(!isValidWorkoutDate("2026-11-02", "2026-10-31"));
  assert.ok(!isValidWorkoutDate("2026-02-30", "2026-10-31"));
  assert.ok(!isValidWorkoutDate("31-10-2026", "2026-10-31"));
  assert.ok(!isValidWorkoutDate("0000-01-01", "2026-10-31"));
});

test("M4/M10: one payload for the transactional function; a missing RIR stays null", () => {
  const args = saveWorkoutArgs("strength", "Legs", "2026-10-31", [s("Pull", null), s("Push")], []);
  assert.equal(args.p_split, "Pull");
  assert.equal(args.p_date, "2026-10-31");
  assert.equal(args.p_sets[0].rir, null);
  assert.equal(args.p_sets[1].rir, 2);
  assert.deepEqual(saveWorkoutArgs("cardio", "x", "2026-10-31", [s("Pull")], [{ activity: "Run", durationMin: 30 }]).p_sets, []);
});
