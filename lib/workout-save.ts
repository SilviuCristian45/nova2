// Pieces of saving a new workout shared by the /insert page and the `save_workout` SQL function.

export type SaveSet = {
  split: string; exercise: string; setNumber: number; reps: number; weight: number;
  rir: number | null; setType: string; notes?: string | null;
};
export type SaveCardio = { activity: string; durationMin: number };

// The workout's split is the one of its sets (like /offline); the picker value only matters for an empty list.
export function workoutSplit(sets: readonly { split: string }[], fallback: string): string {
  return sets[0]?.split ?? fallback;
}

// `value` is the client's local date; one day ahead of the server's covers timezones east of it.
export function isValidWorkoutDate(value: unknown, today: string): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + 1);
  return value <= limit.toISOString().slice(0, 10);
}

export function saveWorkoutArgs(
  mode: "strength" | "cardio", split: string, date: string, sets: readonly SaveSet[], cardio: readonly SaveCardio[],
) {
  return {
    p_mode: mode,
    p_split: mode === "strength" ? workoutSplit(sets, split) : "CARDIO",
    p_date: date,
    p_sets: mode === "strength"
      ? sets.map((s) => ({
          split: s.split, exercise: s.exercise, setNumber: s.setNumber, reps: s.reps, weight: s.weight,
          rir: s.rir ?? null, setType: s.setType, notes: s.notes ?? "",
        }))
      : [],
    p_cardio: mode === "cardio" ? cardio.map((c) => ({ activity: c.activity, durationMin: c.durationMin })) : [],
  };
}
