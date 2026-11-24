"use server";

import { revalidatePath } from "next/cache";
import { getLanguage } from "@/app/language";
import { requireCoach } from "@/lib/coach/auth";
import {
  generateInviteCode,
  validateProgramPayload,
  type ProgramPayloadInput,
} from "@/lib/coach/programs";

export type SaveProgramResult = {
  error?: string;
  success?: boolean;
  programId?: string;
  inviteCode?: string | null;
};

export async function saveProgramAction(input: ProgramPayloadInput): Promise<SaveProgramResult> {
  const { t } = await getLanguage();
  const coach = await requireCoach();
  const checked = validateProgramPayload(input, t);
  if (!checked.ok) return { error: checked.error };

  const data = checked.data;
  const supabase = coach.supabase;
  let programId = data.id;

  if (programId) {
    const { data: updated, error: updateError } = await supabase
      .from("programs")
      .update({
        title: data.title,
        description: data.description,
        difficulty: data.difficulty,
        duration_weeks: data.durationWeeks,
        goal: data.goal,
        status: data.status,
        access_type: data.accessType,
        requires_approval: data.requiresApproval,
        invite_code: data.inviteCode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", programId)
      .eq("coach_id", coach.userId)
      .select("id")
      .maybeSingle();

    if (updateError) {
      if (updateError.code === "23505") {
        return { error: t("Codul de invitație este deja folosit. Generează alt cod.", "Invite code is already in use. Generate another code.") };
      }
      return { error: updateError.message };
    }
    if (!updated) {
      return { error: t("Programul nu a fost găsit.", "Program not found.") };
    }
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("programs")
      .insert({
        coach_id: coach.userId,
        title: data.title,
        description: data.description,
        difficulty: data.difficulty,
        duration_weeks: data.durationWeeks,
        goal: data.goal,
        status: data.status,
        access_type: data.accessType,
        requires_approval: data.requiresApproval,
        invite_code: data.inviteCode,
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return { error: t("Codul de invitație este deja folosit. Generează alt cod.", "Invite code is already in use. Generate another code.") };
      }
      return { error: insertError.message };
    }
    programId = inserted.id as string;
  }

  // Sync program_workouts preserving existing IDs so client workout history references stay intact.
  const { data: existingRows, error: existingError } = await supabase
    .from("program_workouts")
    .select("id")
    .eq("program_id", programId);
  if (existingError) return { error: existingError.message };

  const existingIds = new Set((existingRows ?? []).map((row) => row.id as string));
  const keptIds = new Set<string>();

  for (let i = 0; i < data.workouts.length; i++) {
    const workout = data.workouts[i];
    let workoutId: string;

    if (workout.id && existingIds.has(workout.id)) {
      const { error: wUpdateError } = await supabase
        .from("program_workouts")
        .update({
          week_number: workout.weekNumber,
          day_number: workout.dayNumber,
          position: i + 1,
          title: workout.title,
          workout_mode: workout.workoutMode,
          split: workout.split,
          notes: workout.notes || null,
        })
        .eq("id", workout.id)
        .eq("program_id", programId);
      if (wUpdateError) return { error: wUpdateError.message };
      workoutId = workout.id;
      keptIds.add(workoutId);
    } else {
      const { data: wInserted, error: wInsertError } = await supabase
        .from("program_workouts")
        .insert({
          program_id: programId,
          week_number: workout.weekNumber,
          day_number: workout.dayNumber,
          position: i + 1,
          title: workout.title,
          workout_mode: workout.workoutMode,
          split: workout.split,
          notes: workout.notes || null,
        })
        .select("id")
        .single();
      if (wInsertError) return { error: wInsertError.message };
      workoutId = wInserted.id as string;
      keptIds.add(workoutId);
    }

    const { error: delExError } = await supabase
      .from("program_workout_exercises")
      .delete()
      .eq("program_workout_id", workoutId);
    if (delExError) return { error: delExError.message };

    const { error: delCardioError } = await supabase
      .from("program_workout_cardio")
      .delete()
      .eq("program_workout_id", workoutId);
    if (delCardioError) return { error: delCardioError.message };

    if (workout.workoutMode === "strength" && workout.exercises.length > 0) {
      const { error: exInsertError } = await supabase
        .from("program_workout_exercises")
        .insert(
          workout.exercises.map((ex, exIndex) => ({
            program_workout_id: workoutId,
            position: exIndex + 1,
            exercise: ex.exercise,
            set_type: ex.setType,
            target_sets: ex.targetSets,
            target_reps_min: ex.targetRepsMin,
            target_reps_max: ex.targetRepsMax,
            target_rir: ex.targetRir,
            target_weight_kg: ex.targetWeightKg,
            rest_seconds: ex.restSeconds,
            notes: ex.notes || null,
          })),
        );
      if (exInsertError) return { error: exInsertError.message };
    }

    if (workout.workoutMode === "cardio" && workout.cardio.length > 0) {
      const { error: cardioInsertError } = await supabase
        .from("program_workout_cardio")
        .insert(
          workout.cardio.map((c, cIndex) => ({
            program_workout_id: workoutId,
            position: cIndex + 1,
            activity: c.activity,
            target_duration_min: c.targetDurationMin,
            notes: c.notes || null,
          })),
        );
      if (cardioInsertError) return { error: cardioInsertError.message };
    }
  }

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
  if (toDelete.length > 0) {
    const { error: delWorkoutsError } = await supabase
      .from("program_workouts")
      .delete()
      .in("id", toDelete)
      .eq("program_id", programId);
    if (delWorkoutsError) return { error: delWorkoutsError.message };
  }

  revalidatePath("/coach");
  revalidatePath("/coach/programs");
  revalidatePath(`/coach/programs/${programId}`);
  revalidatePath("/explore");
  revalidatePath("/");

  return { success: true, programId, inviteCode: data.inviteCode };
}

export async function regenerateInviteCodeAction(programId: string): Promise<{ error?: string; inviteCode?: string }> {
  const { t } = await getLanguage();
  const coach = await requireCoach();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode(8);
    const { data, error } = await coach.supabase
      .from("programs")
      .update({ invite_code: code, updated_at: new Date().toISOString() })
      .eq("id", programId)
      .eq("coach_id", coach.userId)
      .select("invite_code")
      .maybeSingle();

    if (!error && data) {
      revalidatePath("/coach/programs");
      revalidatePath(`/coach/programs/${programId}`);
      return { inviteCode: data.invite_code as string };
    }
    if (error && error.code !== "23505") {
      return { error: error.message };
    }
  }

  return { error: t("Nu s-a putut genera un cod unic. Încearcă din nou.", "Could not generate a unique code. Please try again.") };
}

export async function deleteProgramAction(programId: string): Promise<{ error?: string; success?: boolean }> {
  const coach = await requireCoach();
  const { error } = await coach.supabase
    .from("programs")
    .delete()
    .eq("id", programId)
    .eq("coach_id", coach.userId);

  if (error) return { error: error.message };

  revalidatePath("/coach");
  revalidatePath("/coach/programs");
  revalidatePath("/explore");
  revalidatePath("/");
  return { success: true };
}
