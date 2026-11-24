"use server";

import { revalidatePath } from "next/cache";
import { getLanguage } from "@/app/language";
import { createClient } from "@/lib/supabase/server";
import {
  isValidInviteCode,
  normalizeInviteCode,
  type ProgramInvitePreview,
} from "@/lib/coach/types";

export type InviteLookupResult = {
  error?: string;
  preview?: ProgramInvitePreview | null;
};

export async function lookupInviteCodeAction(rawCode: string): Promise<InviteLookupResult> {
  const { t } = await getLanguage();
  const code = normalizeInviteCode(rawCode);
  if (!isValidInviteCode(code)) {
    return {
      error: t(
        "Codul de invitație trebuie să conțină 6–16 litere sau cifre.",
        "Invite code must be 6–16 letters or digits.",
      ),
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: t("Neautorizat.", "Not signed in.") };

  const { data, error } = await supabase.rpc("preview_program_by_invite", { p_code: code });
  if (error) return { error: error.message };

  const rows = (data ?? []) as ProgramInvitePreview[];
  if (rows.length === 0) {
    return {
      preview: null,
      error: t(
        "Nu am găsit niciun program publicat pentru acest cod.",
        "No published program was found for this code.",
      ),
    };
  }
  return { preview: rows[0] };
}

export async function enrollInProgramAction(
  programId: string,
  inviteCode?: string | null,
  shareNutrition = true,
): Promise<{ error?: string; success?: boolean; enrollmentId?: string }> {
  const { t } = await getLanguage();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: t("Neautorizat.", "Not signed in.") };

  const normalized = inviteCode ? normalizeInviteCode(inviteCode) : null;
  const { data, error } = await supabase.rpc("enroll_in_program", {
    p_program_id: programId,
    p_invite_code: normalized,
    p_share_nutrition: shareNutrition,
  });

  if (error) {
    if (/Already enrolled/i.test(error.message)) {
      return { error: t("Ești deja înscris în acest program.", "You are already enrolled in this program.") };
    }
    if (/own program/i.test(error.message)) {
      return { error: t("Nu te poți înscrie în propriul tău program.", "You cannot enroll in your own program.") };
    }
    if (/Invalid invite code/i.test(error.message)) {
      return { error: t("Codul de invitație nu este valid.", "The invite code is not valid.") };
    }
    return { error: error.message };
  }

  revalidatePath("/explore");
  revalidatePath("/");
  revalidatePath("/coach");
  return { success: true, enrollmentId: data as string };
}

export async function cancelPendingEnrollmentAction(
  enrollmentId: string,
): Promise<{ error?: string; success?: boolean }> {
  const { t } = await getLanguage();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: t("Neautorizat.", "Not signed in.") };

  const { error } = await supabase
    .from("enrollments")
    .delete()
    .eq("id", enrollmentId)
    .eq("client_id", user.id)
    .eq("status", "pending");

  if (error) return { error: error.message };

  revalidatePath("/explore");
  revalidatePath("/");
  revalidatePath("/coach");
  return { success: true };
}

export async function toggleEnrollmentNutritionAction(
  enrollmentId: string,
  shareNutrition: boolean,
): Promise<{ error?: string; success?: boolean }> {
  const { t } = await getLanguage();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: t("Neautorizat.", "Not signed in.") };

  const { error } = await supabase
    .from("enrollments")
    .update({ share_nutrition: shareNutrition })
    .eq("id", enrollmentId)
    .eq("client_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/explore");
  revalidatePath("/");
  return { success: true };
}
