import assert from "node:assert/strict";
import { test } from "node:test";
import { displayOrdinals, positionSetNumbers } from "./set-numbering.ts";

const s = (exercise, order, notes = "") => ({ exercise, order, notes });

test("L6: ordinals start at 1 for every exercise and follow the list order", () => {
  const list = [s("Bench", 1), s("Squat", 2), s("Bench", 3), s("Bench", 4), s("Squat", 5)];
  assert.deepEqual(displayOrdinals(list), [1, 1, 2, 3, 2]);
});

test("L6: deleting a set renumbers the rest without reordering anything", () => {
  const list = [s("Bench", 1), s("Squat", 2), s("Bench", 3), s("Bench", 4)];
  const afterDelete = list.filter((_, i) => i !== 0);
  assert.deepEqual(displayOrdinals(afterDelete), [1, 1, 2]); // Squat 1, Bench 1, Bench 2
  assert.deepEqual(afterDelete.map((x) => x.order), [2, 3, 4]); // real order untouched
});

test("L6: stored numbers are positions (they keep the real order), notes stay with their set", () => {
  const out = positionSetNumbers([{ exercise: "Bench", notes: "a" }, { exercise: "Squat", notes: "b" }, { exercise: "Bench", notes: "c" }]);
  assert.deepEqual(out.map((x) => [x.setNumber, x.notes]), [[1, "a"], [2, "b"], [3, "c"]]);
});

test("L6: stored rows (global or per-exercise numbers from older saves) show per-exercise ordinals by their own order", () => {
  // set_number per exercise (older /offline saves): ties keep list order
  const rows = [s("Bench", 1), s("Squat", 1), s("Bench", 2)];
  assert.deepEqual(displayOrdinals(rows), [1, 1, 2]);
  // a group of one exercise saved with global numbers 2, 5, 9
  assert.deepEqual(displayOrdinals([s("Row", 9), s("Row", 2), s("Row", 5)]), [3, 1, 2]);
});
