import assert from "node:assert/strict";
import { test } from "node:test";
import { editSetsFromRows, updateWorkoutArgs } from "./workout-edit.ts";
import { displayOrdinals } from "./set-numbering.ts";

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

test("M5: only stored sets (UUID ids) are sent with an id; form-only sets are sent without one", () => {
  const stored = "7f0c2a4e-1b7d-4c1e-9a55-0d6f3c1b2a90";
  const args = updateWorkoutArgs("w1", "strength", "Push", "2026-10-30", [
    { id: stored, exercise: "Bench", reps: 5, weight: 80, rir: 2, setType: "Working Set", notes: "x" },
    { id: "k3j2h1g", exercise: "Bench", reps: 5, weight: 80, rir: 2, setType: "Working Set" },
    { exercise: "Row", reps: 8, weight: 50, rir: null, setType: "Working Set" },
  ], []);
  assert.equal(args.p_sets[0].id, stored);
  assert.ok(!("id" in args.p_sets[1]));
  assert.ok(!("id" in args.p_sets[2]));
  assert.deepEqual(args.p_sets.map((s) => s.setNumber), [1, 2, 3]);
});

test("L6: /edit stores positions (real order) and shows per-exercise numbers, also after deleting a set", () => {
  const set = (exercise) => ({ exercise, reps: 5, weight: 50, rir: 1, setType: "Working Set" });
  let list = [set("Bench"), set("Squat"), set("Bench"), set("Bench")];
  const show = (l) => displayOrdinals(l.map((s, order) => ({ exercise: s.exercise, order })));
  assert.deepEqual(show(list), [1, 1, 2, 3]);
  assert.deepEqual(updateWorkoutArgs("w", "strength", "Push", "2026-10-30", list, []).p_sets.map((s) => s.setNumber), [1, 2, 3, 4]);
  list = list.filter((_, i) => i !== 0); // delete the first Bench set
  assert.deepEqual(show(list), [1, 1, 2]);
  assert.deepEqual(updateWorkoutArgs("w", "strength", "Push", "2026-10-30", list, []).p_sets.map((s) => [s.exercise, s.setNumber]), [["Squat", 1], ["Bench", 2], ["Bench", 3]]);
});

test("L6 compatibility: a workout saved offline before the change (numbers per exercise) loads, shows and re-saves correctly", () => {
  // Old /offline saves stored 1,2,... per exercise; rows come back in any order from the database.
  const row = (id, exercise, set_number) => ({ id, split: "Push", exercise, set_number, reps: 5, weight: 50, rir: 1, set_type: "Working Set", notes: null });
  const loaded = editSetsFromRows([row("c", "Bench", 2), row("b", "Squat", 1), row("a", "Bench", 1), row("d", "Squat", 2)]);
  const ordinals = displayOrdinals(loaded.map((s) => ({ exercise: s.exercise, order: s.setNumber })));
  const byId = Object.fromEntries(loaded.map((s, i) => [s.id, ordinals[i]]));
  assert.deepEqual(byId, { a: 1, c: 2, b: 1, d: 2 }); // each exercise counts 1, 2 in its own stored order
  // Saving again turns the numbers into positions without reordering sets of the same exercise.
  const saved = updateWorkoutArgs("w", "strength", "Push", "2026-10-30", loaded, []).p_sets;
  assert.deepEqual(saved.map((s) => s.setNumber), [1, 2, 3, 4]);
  const benchOrder = saved.filter((s) => s.exercise === "Bench").map((s) => s.reps);
  assert.equal(benchOrder.length, 2);
  assert.ok(loaded.filter((s) => s.exercise === "Bench").map((s) => s.id).join() === "a,c");
});
