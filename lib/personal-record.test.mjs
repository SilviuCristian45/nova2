import assert from "node:assert/strict";
import { test } from "node:test";
import { beatsBest, draftPersonalRecords } from "./personal-record.ts";

const set = (id, exercise, weight, reps) => ({ id, exercise, weight, reps });
const baselines = { Bench: { weight: 80, reps: 8 }, Row: null };

test("heavier weight or more reps at the same weight beats the best", () => {
  assert.ok(beatsBest({ weight: 82.5, reps: 1 }, { weight: 80, reps: 8 }));
  assert.ok(beatsBest({ weight: 80, reps: 9 }, { weight: 80, reps: 8 }));
  assert.ok(!beatsBest({ weight: 80, reps: 8 }, { weight: 80, reps: 8 }));
  assert.ok(!beatsBest({ weight: 70, reps: 20 }, { weight: 80, reps: 8 }));
});

test("only sets that beat the baseline or an earlier PR are flagged", () => {
  const records = draftPersonalRecords([
    set("a", "Bench", 80, 8), set("b", "Bench", 82.5, 5), set("c", "Bench", 82.5, 5), set("d", "Bench", 82.5, 6),
  ], baselines);
  assert.deepEqual([...records], ["b", "d"]);
});

test("exercises without a baseline never report a PR", () => {
  assert.equal(draftPersonalRecords([set("a", "Row", 100, 10), set("b", "Squat", 100, 10)], baselines).size, 0);
});

test("removing a PR set re-evaluates the later sets", () => {
  const all = [set("a", "Bench", 85, 5), set("b", "Bench", 82.5, 8)];
  assert.deepEqual([...draftPersonalRecords(all, baselines)], ["a"]);
  assert.deepEqual([...draftPersonalRecords([all[1]], baselines)], ["b"]);
});

test("exercises are tracked independently", () => {
  const records = draftPersonalRecords([set("a", "Bench", 90, 1), set("b", "Squat", 60, 5)], { ...baselines, Squat: { weight: 60, reps: 5 } });
  assert.deepEqual([...records], ["a"]);
});

test("a restored draft is evaluated against baselines that arrive later", () => {
  const restored = [set("a", "Bench", 85, 5), set("b", "Bench", 85, 6), set("c", "Squat", 100, 5)];
  assert.equal(draftPersonalRecords(restored, {}).size, 0); // baselines not loaded yet: no false PRs
  const loaded = draftPersonalRecords(restored, { Bench: { weight: 80, reps: 8 }, Squat: { weight: 120, reps: 5 } });
  assert.deepEqual([...loaded], ["a", "b"]);
});

test("deleting the middle PR keeps later sets measured against the remaining best", () => {
  const all = [set("a", "Bench", 82.5, 5), set("b", "Bench", 85, 5), set("c", "Bench", 87.5, 3)];
  assert.deepEqual([...draftPersonalRecords(all, baselines)], ["a", "b", "c"]);
  assert.deepEqual([...draftPersonalRecords([all[0], all[2]], baselines)], ["a", "c"]);
  assert.deepEqual([...draftPersonalRecords([all[2]], baselines)], ["c"]);
});

test("equal sets and lighter sets with more reps are not PRs", () => {
  const records = draftPersonalRecords([set("a", "Bench", 80, 8), set("b", "Bench", 60, 30)], baselines);
  assert.equal(records.size, 0);
});
