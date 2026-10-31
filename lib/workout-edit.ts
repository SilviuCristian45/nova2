// Mapping between stored workout rows, the edit form and the `update_workout` SQL function.

export type EditSet = {
  id?: string;
  split?: string;
  exercise: string;
  setNumber?: number;
  reps: number;
  weight: number;
  rir: number | null;
  setType: string;
  notes?: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sets added in the form get a throwaway client id; only ids of stored sets (real UUIDs) go to the server,
// which keeps those rows (and their ids) and inserts the rest as new.
export const isStoredSetId = (id: unknown): id is string => typeof id === "string" && UUID.test(id);

export type EditCardio = { activity: string; durationMin: number };

type SetRow = {
  id: string; split: string; exercise: string; set_number: number; reps: number;
  weight: number; rir: number | null; set_type: string; notes?: string | null;
};

export function editSetsFromRows(rows: readonly SetRow[]): EditSet[] {
  return rows
    .map((s) => ({
      id: s.id, split: s.split, exercise: s.exercise, setNumber: s.set_number,
      reps: s.reps, weight: s.weight, rir: s.rir, setType: s.set_type, notes: s.notes ?? "",
    }))
    .sort((a, b) => a.setNumber - b.setNumber);
}

export function updateWorkoutArgs(
  workoutId: string,
  mode: "strength" | "cardio",
  split: string,
  performedOn: string,
  sets: readonly EditSet[],
  cardio: readonly EditCardio[],
) {
  return {
    p_workout_id: workoutId,
    p_mode: mode,
    p_split: mode === "strength" ? split : "CARDIO",
    p_date: performedOn,
    p_sets: mode === "strength"
      ? sets.map((s, i) => ({
          ...(isStoredSetId(s.id) ? { id: s.id } : {}),
          split: s.split || split, exercise: s.exercise, setNumber: i + 1, reps: s.reps,
          weight: s.weight, rir: s.rir, setType: s.setType, notes: s.notes ?? "",
        }))
      : [],
    p_cardio: mode === "cardio"
      ? cardio.map((c) => ({ activity: c.activity, durationMin: c.durationMin }))
      : [],
  };
}
