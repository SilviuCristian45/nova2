import assert from "node:assert/strict";
import { test } from "node:test";
import {
  averageRir,
  classifyClientAdherence,
  cutoffDateYmd,
  daysBetweenDates,
  parseRangeDays,
  summarizeNutritionByDay,
} from "./coach/analytics.ts";

test("daysBetweenDates computes non-negative UTC day differences", () => {
  assert.equal(daysBetweenDates("2026-11-20", "2026-11-24"), 4);
  assert.equal(daysBetweenDates("2026-11-24", "2026-11-24"), 0);
  assert.equal(daysBetweenDates("2026-11-25", "2026-11-24"), 0);
});

test("classifyClientAdherence separates newly enrolled clients from paused active clients", () => {
  const today = "2026-11-24";

  // Active client trained 2 days ago -> on_track
  assert.deepEqual(
    classifyClientAdherence({ lastWorkoutDate: "2026-11-22", enrollmentStartedAt: "2026-10-01T10:00:00Z" }, today, 5),
    { kind: "on_track", daysSinceWorkout: 2 },
  );

  // Active client trained 7 days ago -> inactive alert
  assert.deepEqual(
    classifyClientAdherence({ lastWorkoutDate: "2026-11-17", enrollmentStartedAt: "2026-10-01T10:00:00Z" }, today, 5),
    { kind: "inactive", daysSinceWorkout: 7 },
  );

  // Brand new client joined 2 days ago with 0 workouts -> new_no_workouts (not an inactive alarm)
  assert.deepEqual(
    classifyClientAdherence({ lastWorkoutDate: null, enrollmentStartedAt: "2026-11-22T09:00:00Z" }, today, 5),
    { kind: "new_no_workouts", daysSinceStart: 2 },
  );

  // New client joined 6 days ago with still 0 workouts -> new_overdue
  assert.deepEqual(
    classifyClientAdherence({ lastWorkoutDate: null, enrollmentStartedAt: "2026-11-18T09:00:00Z" }, today, 5),
    { kind: "new_overdue", daysSinceStart: 6 },
  );
});

test("averageRir skips warmups and null RIR values", () => {
  assert.equal(
    averageRir([
      { rir: 4, set_type: "Warmup" },
      { rir: 2, set_type: "Working Set" },
      { rir: 1, set_type: "Working Set" },
      { rir: null, set_type: "Working Set" },
    ]),
    1.5,
  );
  assert.equal(averageRir([{ rir: null, set_type: "Working Set" }]), null);
});

test("summarizeNutritionByDay groups meals by day and computes averages", () => {
  const summary = summarizeNutritionByDay([
    {
      performed_on: "2026-11-23",
      meal_items: [
        { total_kcal: 600, total_protein_g: 45, total_carbs_g: 60, total_fat_g: 20 },
        { total_kcal: 400, total_protein_g: 35, total_carbs_g: 40, total_fat_g: 10 },
      ],
    },
    {
      performed_on: "2026-11-24",
      meal_items: [
        { total_kcal: 2000, total_protein_g: 160, total_carbs_g: 200, total_fat_g: 60 },
      ],
    },
  ]);

  assert.equal(summary.daysLogged, 2);
  assert.equal(summary.days[0].date, "2026-11-24");
  assert.equal(summary.days[1].kcal, 1000);
  assert.equal(summary.avgKcal, 1500);
  assert.equal(summary.avgProtein, 120);
});

test("parseRangeDays and cutoffDateYmd restrict allowed windows", () => {
  assert.equal(parseRangeDays(undefined), 30);
  assert.equal(parseRangeDays("90"), 90);
  assert.equal(parseRangeDays("180"), 180);
  assert.equal(parseRangeDays("9999"), 30);
  assert.equal(cutoffDateYmd("2026-11-24", 30), "2026-10-25");
});
