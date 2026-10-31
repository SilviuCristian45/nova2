import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkoutSet } from "@/utils/fitness";
import type { BestSet } from "@/lib/personal-record";

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
    .select("weight, reps")
    .eq("user_id", userId)
    .eq("exercise", exercise)
    .neq("set_type", "Warmup")
    .order("weight", { ascending: false })
    .order("reps", { ascending: false })
    .limit(1);
  if (error) throw error;
  const best = data?.[0];
  return best ? { weight: Number(best.weight), reps: Number(best.reps) } : null;
}
