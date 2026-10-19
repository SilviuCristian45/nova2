import assert from "node:assert/strict";
import { test } from "node:test";
import { getStrengthProgression, strengthProgressionCsv, withBodyWeights } from "./strength-progression.ts";

test("progression matches working-set chart maxima and excludes other exercises and cardio", () => {
  const set = (weight, reps, set_type = "Working Set", exercise = "Bench") => ({
    weight, reps, set_type, exercise,
  });
  const workouts = [
    { performed_on: "2026-10-01", workout_mode: "strength", workout_sets: [
      set(20, 20, "Warm-up"), set("60", "8"), set(50, 12),
      set(100, 30, "Working Set", "Squat"),
    ] },
    { performed_on: "2026-10-02", workout_mode: "cardio", workout_sets: [set(200, 50)] },
    { performed_on: "2026-10-03", workout_mode: "strength", workout_sets: [set(65, 6, null)] },
    { performed_on: "2026-10-04", workout_mode: "strength", workout_sets: null },
  ];
  const points = getStrengthProgression(workouts, "Bench");
  assert.deepEqual(points.map(({ performedOn, weight, reps }) => ({ performedOn, weight, reps })), [
    { performedOn: "2026-10-01", weight: 60, reps: 12 },
    { performedOn: "2026-10-03", weight: 65, reps: 6 },
  ]);
  assert.equal(points[0].date, "Oct 1");
  assert.equal(getStrengthProgression(workouts, "Bench", "ro-RO")[0].date, "1 oct.");
  assert.deepEqual(getStrengthProgression(workouts, "Missing"), []);
});

test("CSV has BOM, explicit units, ISO dates, exact plotted values and escaped text", () => {
  const points = [{ performedOn: "2026-10-01", date: "Oct 1", weight: 62.5, reps: 10 }];
  assert.equal(strengthProgressionCsv(points, 'Presa, "înclinată"'), '\uFEFF"Date","Exercise","Max weight (kg)","Max reps"\r\n"2026-10-01","Presa, ""înclinată""","62.5","10"\r\n');
  assert.match(strengthProgressionCsv(points, "=SUM(A1)"), /"'=SUM\(A1\)"/);
  assert.match(strengthProgressionCsv(points, 'Bench\nPress'), /"Bench\nPress"/);
  assert.match(strengthProgressionCsv(points, "  +1"), /"'  \+1"/);
  assert.equal(strengthProgressionCsv([], "Bench").split("\r\n").length, 2);
});

test("CSV retains more than 1000 sessions and full dates across years", () => {
  const points = Array.from({ length: 1001 }, (_, index) => ({
    performedOn: index === 0 ? "2025-10-01" : "2026-10-01",
    date: "Oct 1", weight: index, reps: 10,
  }));
  const rows = strengthProgressionCsv(points, "Bench").trim().split("\r\n");
  assert.equal(rows.length, 1002);
  assert.match(rows[1], /"2025-10-01"/);
  assert.match(rows.at(-1), /"2026-10-01","Bench","1000","10"/);
});

test("body weight matches exact workout date, repeats for same-day sessions and never fills missing days", () => {
  const points = [
    { performedOn: "2025-10-01", date: "Oct 1", weight: 60, reps: 8 },
    { performedOn: "2026-10-01", date: "Oct 1", weight: 65, reps: 10 },
    { performedOn: "2026-10-01", date: "Oct 1", weight: 70, reps: 6 },
    { performedOn: "2026-10-03", date: "Oct 3", weight: 75, reps: 5 },
  ];
  const result = withBodyWeights(points, [
    { date: "2026-10-01", weight_kg: 76.25 },
    { date: "2026-10-02", weight_kg: 76 },
  ]);
  assert.deepEqual(result.map((point) => point.bodyWeight), [null, 76.25, 76.25, null]);
  assert.equal(points[1].bodyWeight, undefined);
  assert.deepEqual(withBodyWeights(points, []).map((point) => point.bodyWeight), [null, null, null, null]);
  const csv = strengthProgressionCsv(result, "Bench");
  assert.match(csv, /"Max reps","Body weight \(kg\)"/);
  assert.match(csv, /"2025-10-01","Bench","60","8",""/);
  assert.match(csv, /"2026-10-01","Bench","65","10","76.25"/);
  assert.doesNotMatch(strengthProgressionCsv(withBodyWeights(points, []), "Bench"), /Body weight/);
});
