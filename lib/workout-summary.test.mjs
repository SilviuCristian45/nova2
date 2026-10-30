import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWorkoutSummary, formatDuration, MAX_SETS_PER_EXERCISE } from "./workout-summary.ts";

const options = { language: "en", locale: "en-US", formatWeight: (kg) => `${kg} kg` };
const set = (id, exercise, weight, reps, setType = "Working Set") => ({ id, exercise, weight, reps, setType });
const base = { date: "2026-10-30", mode: "strength", title: "Push", durationSec: null, cardio: [], recordIds: new Set() };

test("groups sets per exercise, skips warmups and totals the volume", () => {
  const summary = buildWorkoutSummary({
    ...base,
    sets: [
      set("a", "Bench Press (Barbell)", 20, 10, "Warmup"),
      set("b", "Bench Press (Barbell)", 80, 8),
      set("c", "Bench Press (Barbell)", 80, 6),
      set("d", "Burpees", 0, 15),
    ],
  }, options);
  assert.deepEqual(summary.exercises.map((e) => [e.name, e.sets]), [
    ["Bench Press (Barbell)", ["80 kg × 8", "80 kg × 6"]],
    ["Burpees", ["15 reps"]],
  ]);
  assert.deepEqual(summary.stats, [
    { label: "Exercises", value: "2" },
    { label: "Sets", value: "3" },
    { label: "Volume", value: "1120 kg" },
  ]);
});

test("uses Romanian labels and shows the duration only when a timer ran", () => {
  const ro = { ...options, language: "ro", locale: "ro-RO" };
  const summary = buildWorkoutSummary({ ...base, durationSec: 3900, sets: [set("a", "Burpees", 0, 10)] }, ro);
  assert.equal(summary.stats.at(-1).label, "Durată");
  assert.equal(summary.stats.at(-1).value, "1h 05m");
  const withoutTimer = buildWorkoutSummary({ ...base, sets: [set("a", "Burpees", 0, 10)] }, options);
  assert.equal(withoutTimer.stats.some((s) => s.label === "Duration"), false);
  assert.equal(formatDuration(20), "1 min");
});

test("lists one record per exercise, the latest flagged set", () => {
  const summary = buildWorkoutSummary({
    ...base,
    sets: [set("a", "Burpees", 0, 10), set("b", "Burpees", 0, 12), set("c", "Bench Press (Barbell)", 90, 3)],
    recordIds: new Set(["a", "b"]),
  }, options);
  assert.deepEqual(summary.records, [{ name: "Burpees", text: "12 reps" }]);
  assert.equal(summary.exercises.find((e) => e.name === "Burpees").record, true);
  assert.equal(summary.exercises.find((e) => e.name === "Bench Press (Barbell)").record, false);
});

test("only extra sets are summarized; every exercise and record is kept", () => {
  const extra = Array.from({ length: 15 }, (_, i) => set(`s${i}`, `Exercise ${i + 1}`, 10, 5));
  const many = Array.from({ length: MAX_SETS_PER_EXERCISE + 3 }, (_, i) => set(`m${i}`, "Exercise 0", 10 + i, 5));
  const recordIds = new Set([...extra, ...many].map((entry) => entry.id));
  const summary = buildWorkoutSummary({ ...base, sets: [...many, ...extra], recordIds }, options);
  assert.equal(summary.exercises.length, 16);
  assert.equal(summary.records.length, 16);
  assert.equal(summary.exercises[0].sets.length, MAX_SETS_PER_EXERCISE);
  assert.equal(summary.exercises[0].hiddenSets, 3);
  assert.equal(summary.exercises[0].totalSets, MAX_SETS_PER_EXERCISE + 3);
  assert.equal(summary.exercises[0].top, "18 kg × 5");
});

test("cardio sessions show localized activities and total minutes", () => {
  const summary = buildWorkoutSummary({
    ...base, mode: "cardio", title: "Cardio", sets: [],
    cardio: [{ activity: "Swimming - LISS", durationMin: 30 }, { activity: "Hiking - LISS", durationMin: 45 }],
  }, { ...options, language: "ro", locale: "ro-RO" });
  assert.deepEqual(summary.exercises.map((e) => e.name), ["Înot - LISS", "Drumeție - LISS"]);
  assert.equal(summary.stats[1].value, "75 min");
});
