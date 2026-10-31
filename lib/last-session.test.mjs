import assert from "node:assert/strict";
import { test } from "node:test";
import { getBestSetFromLastSession } from "../utils/fitness.ts";

const set = (weight, reps, performedOn, createdAt) => ({ weight, reps, created_at: createdAt, workouts: { performed_on: performedOn } });

test("H3: the last session is the newest performed_on, not the newest created_at", () => {
  // The offline workout from 10-20 synced on 10-30, after the 10-25 session was saved online.
  const sets = [set(100, 5, "2026-10-20", "2026-10-30T09:00:00Z"), set(60, 10, "2026-10-25", "2026-10-25T18:00:00Z")];
  assert.equal(getBestSetFromLastSession(sets).weight, 60);
});

test("sets from several days are not mixed into one session", () => {
  const sets = [set(70, 8, "2026-10-25", "2026-10-25T18:00:00Z"), set(90, 5, "2026-10-24", "2026-10-24T18:00:00Z")];
  assert.equal(getBestSetFromLastSession(sets).weight, 70);
});

test("sets without a joined workout fall back to created_at", () => {
  const sets = [{ weight: 50, reps: 5, created_at: "2026-10-25T10:00:00Z" }, { weight: 80, reps: 5, created_at: "2026-10-20T10:00:00Z" }];
  assert.equal(getBestSetFromLastSession(sets).weight, 50);
});

import { calculateProgression } from "../utils/fitness.ts";

const en = (_ro, english) => english;
const kg = (v) => `${v} kg`;

test("M11: progression messages go through t() and expose the kind, so the UI does not match on text", () => {
  const none = calculateProgression(null, kg, 2.5, en);
  assert.equal(none.kind, "new");
  assert.match(none.message, /^New exercise/);
  const up = calculateProgression({ weight: 60, reps: 10, rir: 1, created_at: "2026-10-01" }, kg, 2.5, en);
  assert.equal(up.kind, "increase");
  assert.match(up.message, /Last time you did 60 kg × 10 reps \(RIR 1\)\. Today we go up to 62.5 kg/);
  const same = calculateProgression({ weight: 60, reps: 8, rir: 3, created_at: "2026-10-01" }, kg, 2.5, en);
  assert.equal(same.kind, "repeat");
  assert.match(same.message, /Keep 60 kg/);
});

test("M10/M11: a set without RIR neither prints 'RIR null' nor counts as close to failure", () => {
  const noRir = calculateProgression({ weight: 60, reps: 10, rir: null, created_at: "2026-10-01" }, kg, 2.5, en);
  assert.ok(!/RIR/.test(noRir.message));
  assert.equal(noRir.kind, "repeat"); // 10 reps with unknown effort: no weight jump
});
