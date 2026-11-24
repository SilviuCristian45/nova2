"use server";

import { revalidatePath } from "next/cache";
import { getLanguage } from "@/app/language";
import { createClient } from "@/lib/supabase/server";

export async function markNotificationReadAction(id: string): Promise<{ error?: string; success?: boolean }> {
  const { t } = await getLanguage();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: t("Neautorizat.", "Not signed in.") };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) return { error: error.message };
  revalidatePath("/notifications");
  return { success: true };
}

export async function markAllNotificationsReadAction(): Promise<{ error?: string; success?: boolean }> {
  const { t } = await getLanguage();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: t("Neautorizat.", "Not signed in.") };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) return { error: error.message };
  revalidatePath("/notifications");
  return { success: true };
}

export async function deleteNotificationAction(id: string): Promise<{ error?: string; success?: boolean }> {
  const { t } = await getLanguage();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: t("Neautorizat.", "Not signed in.") };

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/notifications");
  return { success: true };
}
