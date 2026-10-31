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

import { bestSetAllTime } from "./personal-record.ts";

test("H1: the PR baseline is the best set ever, not the best set of the last session", () => {
  const history = [
    { weight: 60, reps: 10, set_type: "Working Set" }, // last session
    { weight: 100, reps: 5, set_type: "Working Set" }, // an older, heavier session
    { weight: 100, reps: 3, set_type: "Working Set" },
  ];
  assert.deepEqual(bestSetAllTime(history), { weight: 100, reps: 5 });
});

test("M7: warmups are never a baseline and never a PR", () => {
  assert.deepEqual(bestSetAllTime([{ weight: 120, reps: 1, set_type: "Warmup" }, { weight: 80, reps: 5, set_type: "Working Set" }]), { weight: 80, reps: 5 });
  assert.equal(bestSetAllTime([{ weight: 120, reps: 1, set_type: "Warmup" }]), null);
  assert.equal(bestSetAllTime([]), null);
  const draft = [
    { id: "w", exercise: "Bench", weight: 90, reps: 1, setType: "Warmup" },
    { id: "a", exercise: "Bench", weight: 85, reps: 5, setType: "Working Set" },
  ];
  // The warmup is heavier than the baseline but must not count, nor raise the bar for set "a".
  assert.deepEqual([...draftPersonalRecords(draft, { Bench: { weight: 80, reps: 8 } })], ["a"]);
});

import { recordsByExercise } from "./personal-record.ts";

test("H2: /records picks the best set per exercise (warmups out) and keeps the workout date", () => {
  const rows = [
    { exercise: "Bench", weight: 100, reps: 5, rir: 1, set_type: "Working Set", performed_on: "2026-09-01" },
    { exercise: "Bench", weight: 100, reps: 6, rir: 0, set_type: "Working Set", performed_on: "2026-10-01" },
    { exercise: "Bench", weight: 140, reps: 1, rir: 0, set_type: "Warmup", performed_on: "2026-10-02" },
    { exercise: "Squat", weight: 120, reps: 3, rir: 2, set_type: "Working Set", performed_on: "2026-08-01" },
  ];
  const out = recordsByExercise(rows);
  assert.deepEqual(out.map((r) => [r.exercise, r.weight, r.reps, r.performedOn]), [["Squat", 120, 3, "2026-08-01"], ["Bench", 100, 6, "2026-10-01"]]);
  assert.equal(out[1].oneRM, 120);
});
