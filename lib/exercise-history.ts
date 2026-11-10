import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkoutSet } from "@/utils/fitness";
import type { BestSet } from "@/lib/personal-record";
import type { PlateauSet } from "@/lib/plateau";

// Basis of the progression recommendation: the newest sessions of an exercise, ordered by the date the
// workout was performed (not by created_at, which is when the row was inserted: offline sync, edits, imports).
export async function fetchRecentSets(
  supabase: SupabaseClient,
  userId: string,
  exercise: string,
): Promise<WorkoutSet[]> {
  const { data, error } = await supabase
    .from("workout_sets")
    .select("weight, reps, rir, created_at, set_type, notes, workouts!inner(performed_on)")
    .eq("user_id", userId)
    .eq("exercise", exercise)
    .order("workouts(performed_on)", { ascending: false })
    .order("weight", { ascending: false })
    .order("reps", { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as unknown as WorkoutSet[];
}

// Basis of the personal record: the best non-warmup set ever logged for the exercise.
export async function fetchRecordBaseline(
  supabase: SupabaseClient,
  userId: string,
  exercise: string,
): Promise<BestSet | null> {
  const { data, error } = await supabase
    .from("workout_sets")
    .select("weight, reps, workouts!inner(performed_on)")
    .eq("user_id", userId)
    .eq("exercise", exercise)
    .neq("set_type", "Warmup")
    .order("weight", { ascending: false })
    .order("reps", { ascending: false })
    .order("workouts(performed_on)", { ascending: false })
    .limit(1);
  if (error) throw error;
  const best = data?.[0] as unknown as { weight: number; reps: number; workouts: { performed_on: string } | { performed_on: string }[] } | undefined;
  if (!best) return null;
  const workout = Array.isArray(best.workouts) ? best.workouts[0] : best.workouts;
  return { weight: Number(best.weight), reps: Number(best.reps), performedOn: workout?.performed_on };
}

// Basis of plateau detection: the newest non-warmup sets of the exercise with the date of their workout.
// 300 sets cover well over a dozen sessions, more than the detector needs.
export async function fetchPlateauSets(
  supabase: SupabaseClient,
  userId: string,
  exercise: string,
): Promise<PlateauSet[]> {
  const { data, error } = await supabase
    .from("workout_sets")
    .select("weight, reps, set_type, workouts!inner(performed_on)")
    .eq("user_id", userId)
    .eq("exercise", exercise)
    .neq("set_type", "Warmup")
    .order("workouts(performed_on)", { ascending: false })
    .limit(300);
  if (error) throw error;
  return ((data ?? []) as unknown as { weight: number; reps: number; set_type: string | null; workouts: { performed_on: string } | { performed_on: string }[] }[])
    .map((row) => ({
      weight: row.weight, reps: row.reps, set_type: row.set_type,
      performed_on: (Array.isArray(row.workouts) ? row.workouts[0] : row.workouts)?.performed_on ?? "",
    }))
    .filter((row) => row.performed_on);
}
