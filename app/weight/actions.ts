"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isMeasurementDate, parseBodyWeight } from "@/lib/daily-metrics";

type WeightError = "unauthorized" | "invalid-date" | "invalid-weight" | "storage" | "setup";
type WeightResult =
  | { success: true; weight: number | null }
  | { success: false; error: WeightError };

function storageError(error: { code?: string; message: string }): WeightResult {
  console.error("Daily weight storage failed:", error.code, error.message);
  return {
    success: false,
    error: error.code === "PGRST205" || error.code === "42P01" ? "setup" : "storage",
  };
}

export async function getDailyWeight(date: string): Promise<WeightResult> {
  if (!isMeasurementDate(date)) return { success: false, error: "invalid-date" };
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: "unauthorized" };
  const { data, error } = await supabase.from("daily_weight")
    .select("weight_kg").eq("user_id", user.id).eq("date", date).maybeSingle();
  if (error) return storageError(error);
  return { success: true, weight: data ? Number(data.weight_kg) : null };
}

export async function saveDailyWeight(formData: FormData): Promise<WeightResult> {
  const date = formData.get("date");
  const weight = parseBodyWeight(formData.get("weight"));
  if (!isMeasurementDate(date)) return { success: false, error: "invalid-date" };
  if (weight === null) return { success: false, error: "invalid-weight" };
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: "unauthorized" };
  const { error } = await supabase.from("daily_weight")
    .upsert({ user_id: user.id, date, weight_kg: weight }, { onConflict: "user_id,date" });
  if (error) return storageError(error);
  revalidatePath("/");
  revalidatePath("/stats");
  return { success: true, weight };
}
