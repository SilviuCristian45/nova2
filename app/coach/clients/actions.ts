"use server";

import { revalidatePath } from "next/cache";
import { getLanguage } from "@/app/language";
import { requireCoach } from "@/lib/coach/auth";

export async function respondToEnrollmentAction(
  enrollmentId: string,
  decision: "active" | "rejected",
): Promise<{ error?: string; success?: boolean }> {
  const { t } = await getLanguage();
  const coach = await requireCoach();

  const { data, error } = await coach.supabase
    .from("enrollments")
    .update({ status: decision })
    .eq("id", enrollmentId)
    .eq("coach_id", coach.userId)
    .eq("status", "pending")
    .select("client_id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) {
    return {
      error: t(
        "Cererea nu mai este în așteptare sau nu a fost găsită.",
        "This request is no longer pending or was not found.",
      ),
    };
  }

  revalidatePath("/coach");
  revalidatePath("/coach/clients");
  revalidatePath(`/coach/clients/${data.client_id as string}`);
  revalidatePath("/explore");
  revalidatePath("/");
  return { success: true };
}

export async function updateEnrollmentStatusAction(
  enrollmentId: string,
  clientId: string,
  status: "active" | "paused" | "completed",
): Promise<{ error?: string; success?: boolean }> {
  const coach = await requireCoach();

  const { error } = await coach.supabase
    .from("enrollments")
    .update({ status })
    .eq("id", enrollmentId)
    .eq("coach_id", coach.userId)
    .eq("client_id", clientId);

  if (error) return { error: error.message };

  revalidatePath("/coach");
  revalidatePath("/coach/clients");
  revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath("/explore");
  revalidatePath("/");
  return { success: true };
}

export async function updateEnrollmentWeekAction(
  enrollmentId: string,
  clientId: string,
  currentWeek: number,
): Promise<{ error?: string; success?: boolean }> {
  const { t } = await getLanguage();
  if (!Number.isInteger(currentWeek) || currentWeek < 1 || currentWeek > 52) {
    return { error: t("Săptămâna trebuie să fie între 1 și 52.", "Week must be between 1 and 52.") };
  }
  const coach = await requireCoach();

  const { error } = await coach.supabase
    .from("enrollments")
    .update({ current_week: currentWeek })
    .eq("id", enrollmentId)
    .eq("coach_id", coach.userId)
    .eq("client_id", clientId);

  if (error) return { error: error.message };

  revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath("/");
  return { success: true };
}

export async function assignProgramToClientAction(
  enrollmentId: string,
  clientId: string,
  programId: string,
): Promise<{ error?: string; success?: boolean }> {
  const { t } = await getLanguage();
  const coach = await requireCoach();

  const { data: prog } = await coach.supabase
    .from("programs")
    .select("id")
    .eq("id", programId)
    .eq("coach_id", coach.userId)
    .maybeSingle();

  if (!prog) {
    return { error: t("Programul selectat nu a fost găsit.", "Selected program was not found.") };
  }

  const { error } = await coach.supabase
    .from("enrollments")
    .update({
      program_id: programId,
      current_week: 1,
      assigned_by_coach: true,
    })
    .eq("id", enrollmentId)
    .eq("coach_id", coach.userId)
    .eq("client_id", clientId);

  if (error) return { error: error.message };

  revalidatePath("/coach");
  revalidatePath("/coach/clients");
  revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath("/");
  return { success: true };
}

export async function cloneProgramForClientAction(
  programId: string,
  clientId: string,
): Promise<{ error?: string; success?: boolean; programId?: string }> {
  const coach = await requireCoach();

  const { data, error } = await coach.supabase.rpc("clone_program_for_client", {
    p_program_id: programId,
    p_client_id: clientId,
  });

  if (error) return { error: error.message };

  const newProgramId = data as string;
  revalidatePath("/coach");
  revalidatePath("/coach/programs");
  revalidatePath("/coach/clients");
  revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath("/");
  return { success: true, programId: newProgramId };
}

export async function saveCoachClientNoteAction(
  clientId: string,
  note: string,
): Promise<{ error?: string; success?: boolean; updatedAt?: string }> {
  const { t } = await getLanguage();
  const coach = await requireCoach();

  if (note.length > 4000) {
    return { error: t("Notița poate avea maxim 4000 de caractere.", "Note can have at most 4000 characters.") };
  }

  const nowIso = new Date().toISOString();
  const { error } = await coach.supabase
    .from("coach_client_notes")
    .upsert(
      {
        coach_id: coach.userId,
        client_id: clientId,
        note,
        updated_at: nowIso,
      },
      { onConflict: "coach_id,client_id" },
    );

  if (error) return { error: error.message };

  revalidatePath(`/coach/clients/${clientId}`);
  return { success: true, updatedAt: nowIso };
}
