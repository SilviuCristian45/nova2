import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatExerciseTarget,
  generateInviteCode,
  moveItem,
  pickNextProgramWorkout,
  validateProgramPayload,
} from "./coach/programs.ts";
import { isValidInviteCode } from "./coach/types.ts";

const t = (_ro, en) => en;
const fmtKg = (kg) => `${kg} kg`;

test("generateInviteCode produces valid 8-char uppercase alphanumeric codes", () => {
  for (let i = 0; i < 20; i++) {
    const code = generateInviteCode();
    assert.equal(code.length, 8);
    assert.equal(isValidInviteCode(code), true);
  }
});

test("formatExerciseTarget formats rep ranges, single reps, RIR, weight and rest", () => {
  assert.equal(
    formatExerciseTarget(
      { target_sets: 3, target_reps_min: 8, target_reps_max: 10, target_rir: 2, target_weight_kg: 80, rest_seconds: 90 },
      fmtKg,
      t,
    ),
    "3×8–10 @ RIR 2 · 80 kg · 90s rest",
  );
  assert.equal(
    formatExerciseTarget(
      { target_sets: 4, target_reps_min: 5, target_reps_max: 5, target_rir: null, target_weight_kg: null },
      fmtKg,
      t,
    ),
    "4×5",
  );
});

test("moveItem reorders immutably and handles boundaries safely", () => {
  const base = ["A", "B", "C"];
  assert.deepEqual(moveItem(base, 1, "up"), ["B", "A", "C"]);
  assert.deepEqual(moveItem(base, 1, "down"), ["A", "C", "B"]);
  assert.deepEqual(moveItem(base, 0, "up"), ["A", "B", "C"]);
  assert.deepEqual(moveItem(base, 2, "down"), ["A", "B", "C"]);
  assert.deepEqual(base, ["A", "B", "C"]);
});

test("pickNextProgramWorkout picks the next uncompleted workout from current week and wraps", () => {
  const workouts = [
    { id: "w1d1", week_number: 1, day_number: 1, position: 1 },
    { id: "w1d3", week_number: 1, day_number: 3, position: 1 },
    { id: "w2d1", week_number: 2, day_number: 1, position: 1 },
  ];
  assert.equal(pickNextProgramWorkout(workouts, new Set(), 1)?.id, "w1d1");
  assert.equal(pickNextProgramWorkout(workouts, new Set(["w1d1"]), 1)?.id, "w1d3");
  assert.equal(pickNextProgramWorkout(workouts, new Set(["w1d1", "w1d3"]), 1)?.id, "w2d1");
  assert.equal(pickNextProgramWorkout(workouts, new Set(["w1d1", "w1d3", "w2d1"]), 2)?.id, "w2d1");
  assert.equal(pickNextProgramWorkout([], new Set(), 1), null);
});

test("validateProgramPayload validates constraints and auto-generates invite code for invite_only", () => {
  const res = validateProgramPayload(
    {
      title: "  Upper / Lower 4d  ",
      description: "Hypertrophy block",
      difficulty: "intermediate",
      durationWeeks: 6,
      goal: "hypertrophy",
      status: "published",
      accessType: "invite_only",
      requiresApproval: true,
      inviteCode: null,
      workouts: [
        {
          weekNumber: 1,
          dayNumber: 1,
          title: "Upper A",
          workoutMode: "strength",
          split: "Upper",
          notes: "",
          exercises: [
            {
              exercise: "Barbell Bench Press",
              setType: "Working Set",
              targetSets: 3,
              targetRepsMin: 8,
              targetRepsMax: 10,
              targetRir: 2,
              targetWeightKg: 80.126,
              restSeconds: 120,
              notes: "Control eccentric",
            },
          ],
          cardio: [],
        },
      ],
    },
    t,
  );
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data.title, "Upper / Lower 4d");
    assert.ok(res.data.inviteCode && isValidInviteCode(res.data.inviteCode));
    assert.equal(res.data.workouts[0].exercises[0].targetWeightKg, 80.13);
  }

  const badReps = validateProgramPayload(
    {
      title: "Bad",
      description: "",
      difficulty: "beginner",
      durationWeeks: 4,
      goal: "strength",
      status: "draft",
      accessType: "public",
      requiresApproval: false,
      inviteCode: null,
      workouts: [
        {
          weekNumber: 1,
          dayNumber: 1,
          title: "Day 1",
          workoutMode: "strength",
          split: "Push",
          notes: "",
          exercises: [
            {
              exercise: "Squat",
              setType: "Working Set",
              targetSets: 3,
              targetRepsMin: 12,
              targetRepsMax: 8,
              targetRir: 2,
              targetWeightKg: null,
              restSeconds: null,
              notes: "",
            },
          ],
          cardio: [],
        },
      ],
    },
    t,
  );
  assert.equal(badReps.ok, false);
});
