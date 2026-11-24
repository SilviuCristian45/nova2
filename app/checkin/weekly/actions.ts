"use server";

import { revalidatePath } from "next/cache";
import { getLanguage } from "@/app/language";
import { createClient } from "@/lib/supabase/server";
import { requireCoach } from "@/lib/coach/auth";
import { mondayOfWeek, validateWeeklyCheckinInput } from "@/lib/coach/interactions";
import {
  CHECKIN_PHOTO_BUCKET,
  checkinPhotoPathsFromRow,
  diffRemovedCheckinPhotoPaths,
  validateCheckinPhotoPaths,
} from "@/lib/checkin-photos";
import { localDate } from "@/lib/daily-metrics";

export async function submitWeeklyCheckinAction(input: {
  coachId: string;
  enrollmentId: string | null;
  weekStart?: string;
  weightKg: number | null;
  energy: number;
  sleep: number;
  stress: number;
  clientNotes: string;
  photoFrontPath?: string | null;
  photoBackPath?: string | null;
  photoSidePath?: string | null;
}): Promise<{ error?: string; success?: boolean; message?: string }> {
  const { t } = await getLanguage();
  const checked = validateWeeklyCheckinInput(input, t);
  if (!checked.ok) return { error: checked.error };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: t("Neautorizat.", "Not signed in.") };

  const photoCheck = validateCheckinPhotoPaths(
    {
      front: input.photoFrontPath,
      back: input.photoBackPath,
      side: input.photoSidePath,
    },
    user.id,
    t,
  );
  if (!photoCheck.ok) return { error: photoCheck.error };

  const weekStart = mondayOfWeek(input.weekStart || localDate());

  const { data: existing, error: existingError } = await supabase
    .from("weekly_checkins")
    .select("id, reviewed_at, photo_front_path, photo_back_path, photo_side_path")
    .eq("client_id", user.id)
    .eq("coach_id", input.coachId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (existingError) {
    if (/photo_front_path|photo_back_path|photo_side_path|schema cache|does not exist/i.test(existingError.message)) {
      return {
        error: t(
          "Rulează migrația 202611240003_weekly_checkin_photos.sql în Supabase.",
          "Run the 202611240003_weekly_checkin_photos.sql migration in Supabase.",
        ),
      };
    }
    return { error: existingError.message };
  }

  if (existing) {
    if (existing.reviewed_at) {
      return {
        error: t(
          "Antrenorul a răspuns deja la check-in-ul din această săptămână și nu mai poate fi editat.",
          "Your coach already reviewed this week's check-in, so it can no longer be edited.",
        ),
      };
    }

    const prevPaths = checkinPhotoPathsFromRow({
      photo_front_path: (existing.photo_front_path as string | null) ?? null,
      photo_back_path: (existing.photo_back_path as string | null) ?? null,
      photo_side_path: (existing.photo_side_path as string | null) ?? null,
    });

    const { error: updateError } = await supabase
      .from("weekly_checkins")
      .update({
        weight_kg: checked.data.weightKg,
        energy: checked.data.energy,
        sleep: checked.data.sleep,
        stress: checked.data.stress,
        client_notes: checked.data.clientNotes,
        photo_front_path: photoCheck.paths.front,
        photo_back_path: photoCheck.paths.back,
        photo_side_path: photoCheck.paths.side,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id as string)
      .eq("client_id", user.id);

    if (updateError) return { error: updateError.message };

    const removedPaths = diffRemovedCheckinPhotoPaths(prevPaths, photoCheck.paths);
    if (removedPaths.length > 0) {
      await supabase.storage.from(CHECKIN_PHOTO_BUCKET).remove(removedPaths);
    }

    revalidatePath("/checkin/weekly");
    revalidatePath("/");
    revalidatePath("/coach");
    revalidatePath(`/coach/clients/${user.id}`);
    return {
      success: true,
      message: t("Check-in-ul săptămânal a fost actualizat.", "Weekly check-in updated."),
    };
  }

  const { error: insertError } = await supabase.from("weekly_checkins").insert({
    client_id: user.id,
    coach_id: input.coachId,
    enrollment_id: input.enrollmentId,
    week_start: weekStart,
    weight_kg: checked.data.weightKg,
    energy: checked.data.energy,
    sleep: checked.data.sleep,
    stress: checked.data.stress,
    client_notes: checked.data.clientNotes,
    photo_front_path: photoCheck.paths.front,
    photo_back_path: photoCheck.paths.back,
    photo_side_path: photoCheck.paths.side,
  });

  if (insertError) return { error: insertError.message };

  revalidatePath("/checkin/weekly");
  revalidatePath("/");
  revalidatePath("/coach");
  revalidatePath(`/coach/clients/${user.id}`);
  return {
    success: true,
    message: t("Check-in-ul săptămânal a fost trimis antrenorului.", "Weekly check-in sent to your coach."),
  };
}

// Strictly uses the SECURITY DEFINER RPC review_weekly_checkin so coaches can only touch coach_reply & reviewed_at.
export async function reviewWeeklyCheckinAction(
  checkinId: string,
  reply: string,
  clientIdForRevalidate?: string,
): Promise<{ error?: string; success?: boolean }> {
  const { t } = await getLanguage();
  const trimmed = reply.trim();
  if (trimmed.length < 1 || trimmed.length > 1500) {
    return {
      error: t(
        "Răspunsul trebuie să aibă între 1 și 1500 de caractere.",
        "Reply must be between 1 and 1500 characters.",
      ),
    };
  }

  const coach = await requireCoach();
  const { error } = await coach.supabase.rpc("review_weekly_checkin", {
    p_checkin_id: checkinId,
    p_reply: trimmed,
  });

  if (error) return { error: error.message };

  revalidatePath("/coach");
  revalidatePath("/checkin/weekly");
  revalidatePath("/");
  if (clientIdForRevalidate) revalidatePath(`/coach/clients/${clientIdForRevalidate}`);
  return { success: true };
}
