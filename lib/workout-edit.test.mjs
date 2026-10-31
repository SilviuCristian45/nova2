import assert from "node:assert/strict";
import { test } from "node:test";
import { editSetsFromRows, updateWorkoutArgs } from "./workout-edit.ts";

const row = { id: "a", split: "Push", exercise: "Bench", set_number: 2, reps: 5, weight: 100, rir: 2, set_type: "Working Set", notes: "felt heavy" };

test("editing a workout keeps the notes of existing sets", () => {
  const sets = editSetsFromRows([row, { ...row, id: "b", set_number: 1, notes: null }]);
  assert.deepEqual(sets.map((s) => s.id), ["b", "a"]);
  assert.equal(sets[1].notes, "felt heavy");
  const args = updateWorkoutArgs("w1", "strength", "Push", "2026-10-30", sets, []);
  assert.equal(args.p_sets[1].notes, "felt heavy");
  assert.equal(args.p_sets[0].notes, "");
});

test("update payload renumbers sets and falls back to the workout split", () => {
  const args = updateWorkoutArgs("w1", "strength", "Pull", "2026-10-30", [{ exercise: "Row", reps: 8, weight: 50, rir: 1, setType: "Working Set" }], []);
  assert.deepEqual(args.p_sets[0], { split: "Pull", exercise: "Row", setNumber: 1, reps: 8, weight: 50, rir: 1, setType: "Working Set", notes: "" });
});

test("cardio mode sends no sets and strength mode sends no cardio", () => {
  const s = [{ exercise: "Row", reps: 8, weight: 50, rir: 1, setType: "Working Set" }];
  const c = [{ activity: "Run", durationMin: 30 }];
  assert.equal(updateWorkoutArgs("w", "cardio", "x", "2026-10-30", s, c).p_sets.length, 0);
  assert.equal(updateWorkoutArgs("w", "strength", "x", "2026-10-30", s, c).p_cardio.length, 0);
  assert.equal(updateWorkoutArgs("w", "cardio", "x", "2026-10-30", s, c).p_split, "CARDIO");
});
