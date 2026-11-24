"use server";

import { revalidatePath } from "next/cache";
import { getLanguage } from "@/app/language";
import { createClient } from "@/lib/supabase/server";
import { validateFeedbackInput } from "@/lib/coach/interactions";
import type { FeedbackReaction } from "@/lib/coach/types";

export type FeedbackThreadItem = {
  id: string;
  workoutId: string;
  authorId: string;
  authorName: string;
  isCoachAuthor: boolean;
  body: string;
  reaction: FeedbackReaction | null;
  createdAt: string;
};

export async function addWorkoutFeedbackAction(
  workoutId: string,
  body: string,
  reaction?: FeedbackReaction | null,
  clientIdForRevalidate?: string,
): Promise<{ error?: string; success?: boolean; item?: FeedbackThreadItem }> {
  const { t } = await getLanguage();
  const checked = validateFeedbackInput(body, reaction ?? null, t);
  if (!checked.ok) return { error: checked.error };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: t("Neautorizat.", "Not signed in.") };

  const [{ data: inserted, error }, { data: profile }] = await Promise.all([
    supabase
      .from("workout_feedback")
      .insert({
        workout_id: workoutId,
        author_id: user.id,
        body: checked.body,
        reaction: checked.reaction,
      })
      .select("id, workout_id, author_id, body, reaction, created_at")
      .single(),
    supabase
      .from("profiles")
      .select("display_name, role")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (error) return { error: error.message };

  const isCoachAuthor = profile?.role === "coach";
  const authorName =
    (profile?.display_name as string | null | undefined)?.trim() ||
    (isCoachAuthor ? t("Antrenor", "Coach") : t("Tu", "You"));

  revalidatePath("/history");
  revalidatePath("/coach");
  if (clientIdForRevalidate) revalidatePath(`/coach/clients/${clientIdForRevalidate}`);

  return {
    success: true,
    item: {
      id: inserted.id as string,
      workoutId: inserted.workout_id as string,
      authorId: inserted.author_id as string,
      authorName,
      isCoachAuthor,
      body: inserted.body as string,
      reaction: (inserted.reaction as FeedbackReaction | null) ?? null,
      createdAt: inserted.created_at as string,
    },
  };
}

export async function deleteWorkoutFeedbackAction(
  feedbackId: string,
  clientIdForRevalidate?: string,
): Promise<{ error?: string; success?: boolean }> {
  const { t } = await getLanguage();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: t("Neautorizat.", "Not signed in.") };

  const { error } = await supabase
    .from("workout_feedback")
    .delete()
    .eq("id", feedbackId)
    .eq("author_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/history");
  revalidatePath("/coach");
  if (clientIdForRevalidate) revalidatePath(`/coach/clients/${clientIdForRevalidate}`);
  return { success: true };
}
