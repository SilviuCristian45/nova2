import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatNotification,
  mondayOfWeek,
  validateFeedbackInput,
  validateWeeklyCheckinInput,
} from "./coach/interactions.ts";

const tRo = (ro) => ro;
const tEn = (_ro, en) => en;

test("mondayOfWeek resolves Monday for weekdays, Mondays, and Sundays", () => {
  assert.equal(mondayOfWeek("2026-11-23"), "2026-11-23"); // Monday
  assert.equal(mondayOfWeek("2026-11-24"), "2026-11-23"); // Tuesday
  assert.equal(mondayOfWeek("2026-11-29"), "2026-11-23"); // Sunday
  assert.equal(mondayOfWeek("2026-11-30"), "2026-11-30"); // Next Monday
});

test("validateFeedbackInput checks message bounds and allowed reactions", () => {
  const ok = validateFeedbackInput("  Great squat depth!  ", "fire", tEn);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.body, "Great squat depth!");
    assert.equal(ok.reaction, "fire");
  }

  assert.equal(validateFeedbackInput("   ", null, tEn).ok, false);
  assert.equal(validateFeedbackInput("Nice", "invalid_emoji", tEn).ok, false);
});

test("validateWeeklyCheckinInput validates 1-5 scores, optional weight and notes", () => {
  const ok = validateWeeklyCheckinInput(
    { weightKg: 81.456, energy: 4, sleep: 3, stress: 2, clientNotes: "  Felt strong  " },
    tEn,
  );
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.data.weightKg, 81.46);
    assert.equal(ok.data.clientNotes, "Felt strong");
  }

  assert.equal(
    validateWeeklyCheckinInput({ weightKg: null, energy: 6, sleep: 3, stress: 2, clientNotes: "" }, tEn).ok,
    false,
  );
  assert.equal(
    validateWeeklyCheckinInput({ weightKg: 0, energy: 4, sleep: 3, stress: 2, clientNotes: "" }, tEn).ok,
    false,
  );
});

test("formatNotification renders friendly bilingual messages for all notification types", () => {
  const pr = formatNotification(
    {
      type: "client_pr",
      payload: { client_name: "Ana", exercises: ["Barbell Bench Press"] },
    },
    tRo,
    "ro",
  );
  assert.ok(pr.title.includes("PR"));
  assert.ok(pr.body.includes("Ana"));
  assert.ok(!pr.body.includes("{"));

  const fb = formatNotification(
    {
      type: "workout_feedback",
      payload: { author_name: "Coach Dan", split: "Push", performed_on: "2026-11-24", reaction: "trophy" },
    },
    tEn,
    "en",
  );
  assert.ok(fb.title.includes("🏆"));
  assert.ok(fb.body.includes("Coach Dan"));
  assert.ok(fb.body.includes("Push"));

  const checkin = formatNotification(
    { type: "weekly_checkin_reviewed", payload: { week_start: "2026-11-23" } },
    tRo,
    "ro",
  );
  assert.ok(checkin.body.includes("2026-11-23"));

  const mpAssigned = formatNotification(
    { type: "meal_plan_assigned", payload: { plan_title: "Slăbire 2000 kcal", coach_name: "Coach Dan" } },
    tRo,
    "ro",
  );
  assert.ok(mpAssigned.title.includes("Plan alimentar"));
  assert.ok(mpAssigned.body.includes("Slăbire 2000 kcal"));

  const mpUpdated = formatNotification(
    { type: "meal_plan_updated", payload: { plan_title: "Bulk 3000" } },
    tEn,
    "en",
  );
  assert.ok(mpUpdated.title.includes("Meal plan updated"));
  assert.ok(mpUpdated.body.includes("Bulk 3000"));
});
