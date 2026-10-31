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

test("M1: the volume reaches the formatter unrounded, so lb are rounded only for display", () => {
  const seen = [];
  const lb = (kg) => Math.round(kg / 0.45359237);
  const opts = { ...options, formatVolume: (kg) => { seen.push(kg); return `${lb(kg)} lb`; } };
  // 135 lb is stored as 61.23 kg: rounding 306.15 kg to 306 first showed 674.6 lb instead of 675.
  const big = buildWorkoutSummary({ ...base, sets: [set("a", "Bench Press (Barbell)", 61.23, 5)] }, opts);
  assert.equal(big.stats.at(-1).value, "675 lb");
  // 1 lb = 0.45 kg used to round to 0 and show "0 lb".
  const tiny = buildWorkoutSummary({ ...base, sets: [set("a", "Bench Press (Barbell)", 0.45, 1)] }, opts);
  assert.equal(tiny.stats.at(-1).value, "1 lb");
  assert.deepEqual(seen, [306.15, 0.45]);
});

test("M1: without a dedicated volume formatter the formatter still gets the raw kg", () => {
  const seen = [];
  buildWorkoutSummary({ ...base, sets: [set("a", "Bench Press (Barbell)", 61.23, 5)] }, { ...options, formatWeight: (kg) => { seen.push(kg); return "x"; } });
  assert.ok(seen.includes(306.15));
});
