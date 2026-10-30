import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CARDIO_CATALOG, EQUIPMENT, EXERCISE_CATALOG, EXERCISE_TYPES, MUSCLE_GROUPS,
  cardioName, cardioNamePair, exerciseName, exerciseNamePair, getExercise, matchesCardioQuery, matchesExerciseQuery,
} from "./exercise-catalog.ts";
import { CARDIO_ACTIVITIES, EXERCISES, EXERCISES_BY_GROUP, getExercisesForSplit } from "./workout-data.ts";

// Names that were stored before localization existed: they must stay valid ids forever.
const legacy = JSON.parse(readFileSync(new URL("./exercise-catalog.legacy.json", import.meta.url), "utf8"));

test("every previously stored exercise and cardio id is still in the catalog", () => {
  for (const id of legacy.exercises) assert.ok(EXERCISES.includes(id), id);
  for (const id of legacy.cardio) assert.ok(CARDIO_ACTIVITIES.includes(id), id);
});

test("ids are unique and Romanian names are not duplicated", () => {
  assert.equal(new Set(EXERCISE_CATALOG.map((e) => e.id)).size, EXERCISE_CATALOG.length);
  assert.equal(new Set(EXERCISE_CATALOG.map((e) => e.ro)).size, EXERCISE_CATALOG.length);
  assert.equal(new Set(CARDIO_CATALOG.map((e) => e.id)).size, CARDIO_CATALOG.length);
  assert.equal(new Set(CARDIO_CATALOG.map((e) => e.ro)).size, CARDIO_CATALOG.length);
});

test("metadata is complete and uses known values", () => {
  for (const e of EXERCISE_CATALOG) {
    assert.ok(e.ro.trim() && e.id.length <= 300, e.id);
    assert.ok(MUSCLE_GROUPS.includes(e.primary), e.id);
    assert.ok(e.secondary.every((m) => MUSCLE_GROUPS.includes(m) && m !== e.primary), e.id);
    assert.ok(EQUIPMENT.includes(e.equipment), e.id);
    assert.ok(EXERCISE_TYPES.includes(e.type), e.id);
  }
  for (const c of CARDIO_CATALOG) assert.ok(c.ro.trim() && c.id.length <= 120, c.id);
});

test("every requested muscle category has exercises", () => {
  const primaries = new Set(EXERCISE_CATALOG.map((e) => e.primary));
  for (const m of ["chest", "back", "shoulders", "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes", "calves", "abs"])
    assert.ok(primaries.has(m), m);
});

test("split lists keep their defaults and cover the whole catalog", () => {
  assert.equal(EXERCISES_BY_GROUP.Push[0], "Bench Press (Barbell)");
  assert.equal(EXERCISES_BY_GROUP.Pull[0], "Deadlift (Conventional Barbell)");
  assert.equal(EXERCISES_BY_GROUP.Legs[0], "Squat (Barbell - High Bar)");
  assert.equal(EXERCISES_BY_GROUP.Core[0], "Crunches (Bodyweight)");
  assert.equal(EXERCISES.length, EXERCISE_CATALOG.length);
  assert.equal(getExercisesForSplit("Full Body").length, EXERCISE_CATALOG.length);
});

test("names follow the language and fall back to the stored id", () => {
  assert.equal(exerciseName("Burpees", "en"), "Burpees");
  assert.equal(exerciseName("Sit-ups (Bodyweight)", "ro"), "Abdomene (Sit-ups)");
  assert.equal(exerciseName("Custom lift", "ro"), "Custom lift");
  assert.equal(cardioName("Swimming - LISS", "ro"), "Înot - LISS");
  assert.equal(cardioName("Swimming - LISS", "en"), "Swimming - LISS");
  assert.equal(cardioName("Old activity", "ro"), "Old activity");
});

test("search matches both languages and ignores diacritics", () => {
  assert.ok(matchesExerciseQuery("Pull-ups (Pronated Grip)", "tractiuni"));
  assert.ok(matchesExerciseQuery("Pull-ups (Pronated Grip)", "PULL-UPS"));
  assert.ok(!matchesExerciseQuery("Pull-ups (Pronated Grip)", "genuflexiuni"));
  assert.ok(matchesCardioQuery("Swimming - LISS", "inot"));
  assert.ok(matchesExerciseQuery("Burpees", "  "));
});

test("name pairs keep the UI language dominant and the other language secondary", () => {
  assert.deepEqual(exerciseNamePair("Dips (Bodyweight)", "ro"), { primary: "Dips la paralele", secondary: "Dips (Bodyweight)" });
  assert.deepEqual(exerciseNamePair("Dips (Bodyweight)", "en"), { primary: "Dips (Bodyweight)", secondary: "Dips la paralele" });
  assert.deepEqual(exerciseNamePair("Burpees", "ro"), { primary: "Burpees", secondary: null });
  assert.deepEqual(exerciseNamePair("Unknown lift", "ro"), { primary: "Unknown lift", secondary: null });
  assert.deepEqual(cardioNamePair("SkiErg - HIIT", "en"), { primary: "SkiErg - HIIT", secondary: null });
  assert.deepEqual(cardioNamePair("Swimming - HIIT", "ro"), { primary: "Înot - HIIT", secondary: "Swimming - HIIT" });
});

test("cardio names switch with the language and never change the stored id", () => {
  for (const activity of CARDIO_CATALOG) {
    assert.equal(cardioName(activity.id, "en"), activity.id);
    assert.equal(cardioName(activity.id, "ro"), activity.ro);
  }
});

test("gym terminology: natural Romanian names for the reviewed exercises", () => {
  assert.equal(exerciseName("Dips (Bodyweight)", "ro"), "Dips la paralele");
  assert.equal(exerciseName("Lat Pulldown (Cable - Wide Grip)", "ro"), "Tracțiuni la helcometru, priză largă");
  assert.equal(exerciseName("Triceps Pushdown (Cable - Rope)", "ro"), "Extensii triceps la scripete cu coardă");
  assert.equal(exerciseName("Seated Leg Curl (Machine)", "ro"), "Flexii femurale la aparat, așezat");
  assert.ok(EXERCISE_CATALOG.every((e) => !/cablu/i.test(e.ro)), "cable exercises use scripete");
  const landmine = getExercise("Landmine Press (Barbell)");
  assert.equal(landmine.primary, "shoulders");
  assert.ok(landmine.secondary.includes("chest"));
});
