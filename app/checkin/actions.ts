"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isMeasurementDate } from "@/lib/daily-metrics";
import { emptyCheckin, parseCheckin, type CheckinValues } from "@/lib/checkin";

type CheckinError = "unauthorized" | "invalid-date" | "invalid-checkin" | "storage" | "setup";
type CheckinResult =
  | { success: true; checkin: CheckinValues | null }
  | { success: false; error: CheckinError };

function storageError(error: { code?: string; message: string }): CheckinResult {
  console.error("Daily check-in storage failed:", error.code, error.message);
  return { success: false, error: error.code === "PGRST205" || error.code === "42P01" ? "setup" : "storage" };
}

export async function getDailyCheckin(date: string): Promise<CheckinResult> {
  if (!isMeasurementDate(date)) return { success: false, error: "invalid-date" };
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: "unauthorized" };
  const { data, error } = await supabase.from("daily_checkin")
    .select("energy, satiety, sleep, note").eq("user_id", user.id).eq("date", date).maybeSingle();
  if (error) return storageError(error);
  return { success: true, checkin: data ? { ...emptyCheckin(), ...data, note: data.note ?? "" } : null };
}

export async function saveDailyCheckin(formData: FormData): Promise<CheckinResult> {
  const date = formData.get("date");
  if (!isMeasurementDate(date)) return { success: false, error: "invalid-date" };
  const values = parseCheckin({
    energy: formData.get("energy"), satiety: formData.get("satiety"), sleep: formData.get("sleep"), note: formData.get("note"),
  });
  if (!values) return { success: false, error: "invalid-checkin" };
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: "unauthorized" };
  const { error } = await supabase.from("daily_checkin").upsert({
    user_id: user.id, date, energy: values.energy, satiety: values.satiety, sleep: values.sleep, note: values.note || null,
  }, { onConflict: "user_id,date" });
  if (error) return storageError(error);
  revalidatePath("/");
  revalidatePath("/stats");
  return { success: true, checkin: values };
}
