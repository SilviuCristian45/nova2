import { CARDIO_CATALOG, EXERCISE_CATALOG, type ExerciseGroup } from "./exercise-catalog.ts";

export const SPLITS = ["Push", "Pull", "Legs", "Upper", "Lower", "Full Body", "Core"] as const;
export type Split = typeof SPLITS[number];

export const SET_TYPES = ["Warmup", "Feeder", "Working Set", "Drop Set", "Myo-Reps", "Rest-Pause"] as const;
export type SetType = typeof SET_TYPES[number];

export const WORKOUT_MODES = ["strength", "cardio", "mobility"] as const;
export type WorkoutMode = typeof WORKOUT_MODES[number];

// Derived from lib/exercise-catalog.ts; the ids are the stored English names.
const idsFor = (group: ExerciseGroup) =>
  EXERCISE_CATALOG.filter((exercise) => exercise.group === group).map((exercise) => exercise.id);

export const EXERCISES_BY_GROUP = {
  Push: idsFor("Push"),
  Pull: idsFor("Pull"),
  Legs: idsFor("Legs"),
  Core: idsFor("Core"),
  FullBody: idsFor("FullBody"),
};

// Păstrăm și lista completă pentru compatibilitate în restul aplicației
export const EXERCISES = [
  ...EXERCISES_BY_GROUP.Push,
  ...EXERCISES_BY_GROUP.Pull,
  ...EXERCISES_BY_GROUP.Legs,
  ...EXERCISES_BY_GROUP.Core,
  ...EXERCISES_BY_GROUP.FullBody
];

// FUNCȚIA MAGICĂ: Alege exercițiile potrivite în funcție de Split-ul selectat
export function getExercisesForSplit(split: Split): string[] {
  switch (split) {
    case "Push": return EXERCISES_BY_GROUP.Push;
    case "Pull": return EXERCISES_BY_GROUP.Pull;
    case "Legs": return EXERCISES_BY_GROUP.Legs;
    case "Upper": return [...EXERCISES_BY_GROUP.Push, ...EXERCISES_BY_GROUP.Pull];
    case "Lower": return EXERCISES_BY_GROUP.Legs;
    case "Core": return EXERCISES_BY_GROUP.Core;
    case "Full Body": return EXERCISES; // Returnează tot
    default: return EXERCISES;
  }
}

export const CARDIO_ACTIVITIES = CARDIO_CATALOG.map((activity) => activity.id);
