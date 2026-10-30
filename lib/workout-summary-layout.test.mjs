import assert from "node:assert/strict";
import { test } from "node:test";
import { EXERCISE_CATALOG } from "./exercise-catalog.ts";
import { formatWeight } from "./units.ts";
import { buildWorkoutSummary } from "./workout-summary.ts";
import {
  CARD_HEIGHT, CARD_WIDTH, CONTENT_BOTTOM, MIN_FONT_SIZE, PAD, computeLayout,
} from "./workout-summary-layout.ts";

// Real fonts vary; 0.55 em per character is a typical sans-serif average and keeps the test deterministic.
const measure = (text, size) => text.length * size * 0.55;
const labels = {
  recordsTitle: "Personal records", recordBadge: "PR",
  moreExercises: (n) => `+ ${n} more exercises`, moreSets: (n) => `+${n} sets`,
  setsSummary: (total, top) => `${total} sets · ${top}`,
};
const options = { language: "en", locale: "en-US", formatWeight: (kg) => `${kg} kg` };
const base = { date: "2026-10-30", mode: "strength", title: "Push", durationSec: null, cardio: [] };

function workout({ exercises, setsEach, records = 0, names }) {
  const sets = [];
  for (let e = 0; e < exercises; e++) {
    const exercise = names?.[e] ?? EXERCISE_CATALOG[e * 3 % EXERCISE_CATALOG.length].id;
    for (let s = 0; s < setsEach; s++) sets.push({ id: `${e}-${s}`, exercise, weight: 60 + s * 2.5, reps: 8 + (s % 3), setType: "Working Set" });
  }
  const recordIds = new Set(Array.from({ length: records }, (_, i) => `${i}-0`));
  return { ...base, sets, recordIds };
}

function assertInsideCard(layout) {
  assert.ok(layout.bottom <= CONTENT_BOTTOM, `content ends at ${layout.bottom}`);
  for (const item of layout.items) {
    if (item.kind === "rect") {
      assert.ok(item.x >= 0 && item.y >= 0 && item.x + item.w <= CARD_WIDTH && item.y + item.h <= CARD_HEIGHT, JSON.stringify(item));
      continue;
    }
    assert.ok(item.size >= MIN_FONT_SIZE, `font ${item.size} for "${item.text}"`);
    assert.ok(item.y <= CARD_HEIGHT - 20 && item.y - item.size >= 0, `y of "${item.text}"`);
    const width = measure(item.text, item.size);
    if (item.align === "right") assert.ok(item.x - width >= PAD - 1 && item.x <= CARD_WIDTH - PAD + 1, item.text);
    else if (item.align === "center") assert.ok(item.x - width / 2 >= 0 && item.x + width / 2 <= CARD_WIDTH, item.text);
    else assert.ok(item.x >= PAD - 1 && item.x + width <= CARD_WIDTH - PAD + 1, `"${item.text}" overflows the right edge`);
  }
}

const textsOf = (layout) => layout.items.filter((item) => item.kind === "text").map((item) => item.text);

test("a small workout uses the comfortable tier and keeps every exercise", () => {
  const summary = buildWorkoutSummary(workout({ exercises: 4, setsEach: 3, records: 1 }), options);
  const layout = computeLayout(summary, labels, measure);
  assert.equal(layout.tier, "comfortable");
  assert.equal(layout.hiddenExercises, 0);
  assertInsideCard(layout);
});

test("10+ exercises with many sets and several PRs still fit without dropping anything", () => {
  for (const exercises of [10, 12, 16, 24]) {
    const summary = buildWorkoutSummary(workout({ exercises, setsEach: 8, records: Math.min(exercises, 6) }), options);
    const layout = computeLayout(summary, labels, measure);
    assertInsideCard(layout);
    assert.equal(layout.hiddenExercises, 0, `${exercises} exercises`);
    const texts = textsOf(layout);
    for (const exercise of summary.exercises) {
      const prefix = exercise.name.slice(0, 8);
      assert.ok(texts.some((text) => text.replace("★ ", "").startsWith(prefix)), `missing ${exercise.name}`);
    }
    assert.equal(layout.items.filter((item) => item.kind === "text" && item.weight === 700).length, summary.records.length);
  }
});

test("denser tiers are only used when needed, in a fixed order", () => {
  const tiers = [3, 8, 11, 14, 30].map((n) => computeLayout(buildWorkoutSummary(workout({ exercises: n, setsEach: 6, records: 2 }), options), labels, measure).tier);
  const order = ["comfortable", "comfortable-90", "comfortable-80", "two-columns", "three-columns"];
  const ranks = tiers.map((tier) => order.indexOf(tier));
  assert.ok(ranks.every((rank) => rank >= 0), tiers.join());
  assert.deepEqual([...ranks].sort((a, b) => a - b), ranks, `tiers must not get less dense as the workout grows: ${tiers}`);
  assert.equal(tiers[0], "comfortable");
  assert.notEqual(tiers.at(-1), "comfortable");
});

test("very long exercise names are cut inside the card, not drawn past it", () => {
  const long = "Extremely Long Custom Exercise Name With Many Words That Never Ends ".repeat(4).trim();
  const names = Array.from({ length: 12 }, (_, i) => `${long} ${i}`);
  const layout = computeLayout(buildWorkoutSummary(workout({ exercises: 12, setsEach: 4, records: 3, names }), options), labels, measure);
  assertInsideCard(layout);
  assert.equal(layout.hiddenExercises, 0);
});

test("huge volumes and long titles shrink inside the stat tiles and header", () => {
  const huge = { ...workout({ exercises: 3, setsEach: 5 }), title: "Upper Body Hypertrophy Block Week 12 Heavy Day", durationSec: 36000 };
  huge.sets = huge.sets.map((set) => ({ ...set, weight: 9999.5, reps: 99999 }));
  const summary = buildWorkoutSummary(huge, { ...options, formatWeight: (kg) => formatWeight(kg, "lb", "en-US") });
  const layout = computeLayout(summary, labels, measure);
  assertInsideCard(layout);
  assert.ok(summary.stats.some((stat) => stat.label === "Volume" && stat.value.length > 10));
});

test("an absurd workout lists whole exercises and states how many were left out", () => {
  const summary = buildWorkoutSummary(workout({ exercises: 120, setsEach: 3, records: 3, names: Array.from({ length: 120 }, (_, i) => `Custom exercise ${i}`) }), options);
  const layout = computeLayout(summary, labels, measure);
  assertInsideCard(layout);
  assert.equal(layout.tier, "three-columns");
  assert.ok(layout.hiddenExercises > 0 && layout.hiddenExercises < 120);
  assert.ok(textsOf(layout).includes(labels.moreExercises(layout.hiddenExercises)));
  const shown = textsOf(layout).filter((text) => text.startsWith("Custom exercise")).length;
  assert.equal(shown + layout.hiddenExercises, 120);
});

test("cardio sessions with many activities fit too", () => {
  const cardio = Array.from({ length: 14 }, (_, i) => ({ activity: i % 2 ? "Swimming - LISS" : "Treadmill - Incline Walk (12-3-30)", durationMin: 10 + i }));
  const summary = buildWorkoutSummary({ ...base, mode: "cardio", title: "Cardio", sets: [], cardio, recordIds: new Set() }, { ...options, language: "ro", locale: "ro-RO" });
  const layout = computeLayout(summary, labels, measure);
  assertInsideCard(layout);
  assert.equal(layout.hiddenExercises, 0);
});

test("kg values convert to lb on the card, for sets and for volume", () => {
  const input = { ...base, sets: [{ id: "a", exercise: "Burpees", weight: 100, reps: 5, setType: "Working Set" }], recordIds: new Set() };
  const lb = buildWorkoutSummary(input, { ...options, formatWeight: (kg) => formatWeight(kg, "lb", "en-US") });
  assert.equal(lb.exercises[0].sets[0], "220.5 lb × 5");
  assert.equal(lb.stats.find((stat) => stat.label === "Volume").value, "1,102.3 lb");
  const kg = buildWorkoutSummary(input, { ...options, formatWeight: (value) => formatWeight(value, "kg", "en-US") });
  assert.equal(kg.exercises[0].sets[0], "100 kg × 5");
  assert.equal(kg.stats.find((stat) => stat.label === "Volume").value, "500 kg");
});
