import assert from "node:assert/strict";
import test from "node:test";
import { ageOn, macrosFor, mifflinStJeor, recommendEnergy, weightTrendKgPerWeek } from "./energy.ts";

const today = "2026-10-26";
const daysAgo = (n) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
const base = {
  sex: "male", heightCm: 180, birthDate: "1996-10-27", activityLevel: "moderate",
  goalKgPerWeek: -0.5, weights: [], intake: [], today,
};

test("Mifflin-St Jeor and age", () => {
  assert.equal(ageOn("1996-10-27", today), 29);
  assert.equal(ageOn("1996-10-26", today), 30);
  assert.equal(mifflinStJeor(80, 180, 30, "male"), 1780);
  assert.equal(mifflinStJeor(60, 165, 30, "female"), 1320.25);
});

test("weight trend needs enough weigh-ins over enough days", () => {
  assert.equal(weightTrendKgPerWeek([{ date: daysAgo(2), weightKg: 80 }, { date: daysAgo(0), weightKg: 79 }]), null);
  assert.equal(weightTrendKgPerWeek([0, 3, 6].map((n) => ({ date: daysAgo(n), weightKg: 80 }))), null);
  // Losing 0.3 kg/week, measured every other day for 4 weeks
  const weights = Array.from({ length: 14 }, (_, i) => ({ date: daysAgo(27 - i * 2), weightKg: 82 - (0.3 / 7) * i * 2 }));
  assert.ok(Math.abs(weightTrendKgPerWeek(weights) + 0.3) < 1e-9);
});

test("formula estimate is used until enough meals are logged", () => {
  const result = recommendEnergy({ ...base, weights: [{ date: daysAgo(0), weightKg: 80 }] });
  assert.equal(result.source, "formula");
  assert.equal(result.bmr, 1785); // 80 kg, 180 cm, 29 years
  assert.equal(result.tdee, Math.round(1785 * 1.55));
  assert.equal(result.targets.kcal, Math.round((1785 * 1.55 - 550) / 10) * 10);
  assert.equal(result.intakeChange, null);
});

test("real trend and intake drive the recommendation: losing 0.3, wanting 0.5 means about 220 kcal less", () => {
  const weights = Array.from({ length: 14 }, (_, i) => ({ date: daysAgo(27 - i * 2), weightKg: 82 - (0.3 / 7) * i * 2 }));
  const intake = Array.from({ length: 20 }, (_, i) => ({ date: daysAgo(i + 1), kcal: 2400 }));
  const result = recommendEnergy({ ...base, weights, intake: [...intake, { date: today, kcal: 300 }] });
  assert.equal(result.source, "adaptive");
  assert.equal(result.loggedDays, 20); // today's partial log is ignored
  assert.equal(result.averageIntake, 2400);
  assert.equal(result.adaptiveTdee, 2730); // 2400 + 0.3 * 7700 / 7
  assert.equal(result.trendKgPerWeek, -0.3);
  assert.equal(result.targets.kcal, 2180);
  assert.equal(result.intakeChange, -220);
});

test("missing profile data is reported and a safety floor applies", () => {
  const result = recommendEnergy({ ...base, sex: null, heightCm: null, activityLevel: null });
  assert.deepEqual(result.missing, ["sex", "height", "activity", "weight"]);
  assert.equal(result.targets, null);
  const tiny = recommendEnergy({ ...base, sex: "female", heightCm: 150, activityLevel: "sedentary", goalKgPerWeek: -1,
    weights: [{ date: today, weightKg: 45 }] });
  assert.equal(tiny.targets.kcal, 1200);
  assert.equal(tiny.floorApplied, true);
});

test("macros add up to the calorie target", () => {
  const m = macrosFor(2200, 80, -0.5);
  assert.equal(m.protein, 160);
  assert.ok(Math.abs(m.protein * 4 + m.carbs * 4 + m.fat * 9 - 2200) <= 4);
});
