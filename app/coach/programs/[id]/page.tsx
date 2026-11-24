import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/coach/auth";
import type {
  Program,
  ProgramWorkout,
  ProgramWorkoutCardio,
  ProgramWorkoutExercise,
} from "@/lib/coach/types";
import { Screen } from "@/app/components/ui";
import { ProgramBuilder, type InitialProgramData } from "../program-builder";

export const dynamic = "force-dynamic";

type WorkoutWithItems = ProgramWorkout & {
  program_workout_exercises: ProgramWorkoutExercise[] | null;
  program_workout_cardio: ProgramWorkoutCardio[] | null;
};

export default async function EditCoachProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const coach = await requireCoach();

  const { data: program } = await coach.supabase
    .from("programs")
    .select("*")
    .eq("id", id)
    .eq("coach_id", coach.userId)
    .maybeSingle();

  if (!program) notFound();
  const typedProgram = program as Program;

  const { data: workoutsData } = await coach.supabase
    .from("program_workouts")
    .select("*, program_workout_exercises(*), program_workout_cardio(*)")
    .eq("program_id", typedProgram.id)
    .order("week_number", { ascending: true })
    .order("day_number", { ascending: true })
    .order("position", { ascending: true });

  const workouts = ((workoutsData ?? []) as WorkoutWithItems[]).map((w) => ({
    id: w.id,
    weekNumber: w.week_number,
    dayNumber: w.day_number,
    title: w.title,
    workoutMode: w.workout_mode,
    split: w.split,
    notes: w.notes ?? "",
    exercises: [...(w.program_workout_exercises ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((ex) => ({
        id: ex.id,
        exercise: ex.exercise,
        setType: ex.set_type,
        targetSets: ex.target_sets,
        targetRepsMin: ex.target_reps_min,
        targetRepsMax: ex.target_reps_max,
        targetRir: ex.target_rir,
        targetWeightKg: ex.target_weight_kg === null ? null : Number(ex.target_weight_kg),
        restSeconds: ex.rest_seconds,
        notes: ex.notes ?? "",
      })),
    cardio: [...(w.program_workout_cardio ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((c) => ({
        id: c.id,
        activity: c.activity,
        targetDurationMin: c.target_duration_min,
        notes: c.notes ?? "",
      })),
  }));

  const initial: InitialProgramData = {
    id: typedProgram.id,
    title: typedProgram.title,
    description: typedProgram.description ?? "",
    difficulty: typedProgram.difficulty,
    durationWeeks: typedProgram.duration_weeks,
    goal: typedProgram.goal,
    status: typedProgram.status,
    accessType: typedProgram.access_type,
    requiresApproval: typedProgram.requires_approval,
    inviteCode: typedProgram.invite_code,
    workouts,
  };

  return (
    <Screen back="/coach/programs" title={typedProgram.title}>
      <ProgramBuilder initial={initial} />
    </Screen>
  );
}
