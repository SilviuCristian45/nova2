"use server"

import { getLanguage } from "@/app/language"
import { createClient } from "@/lib/supabase/server"
import { ACTIVITY_LEVELS, WINDOW_DAYS, type ActivityLevel, type EnergyInput } from "@/lib/energy"
import { isMeasurementDate } from "@/lib/daily-metrics"

const PAGE_SIZE = 1000

// Everything the recommendation needs; the client computes it so changing the goal updates it instantly.
// `today` comes from the client so the window follows the user's timezone.
export async function getEnergyData(today: string): Promise<{ error?: string; input?: Omit<EnergyInput, "today"> }> {
  const { t } = await getLanguage()
  if (!isMeasurementDate(today, "9999-12-31")) return { error: t("Dată invalidă.", "Invalid date.") }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: t("Neautorizat", "Not signed in") }

  const start = new Date(Date.parse(`${today}T00:00:00Z`) - (WINDOW_DAYS - 1) * 86400000).toISOString().slice(0, 10)

  const [profile, weights] = await Promise.all([
    supabase.from("profiles").select("sex, height_cm, birth_date, activity_level, goal_kg_per_week").eq("id", user.id).maybeSingle(),
    supabase.from("daily_weight").select("date, weight_kg").eq("user_id", user.id).gte("date", start).lte("date", today).order("date"),
  ])
  if (profile.error || weights.error) {
    console.error(profile.error ?? weights.error)
    return { error: t("Nu am putut încărca datele.", "Could not load your data.") }
  }

  // Daily intake = sum of the meal items logged on each day.
  const kcalByDay = new Map<string, number>()
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("meal_items")
      .select("total_kcal, meals!inner(performed_on, user_id)")
      .eq("meals.user_id", user.id).gte("meals.performed_on", start).lte("meals.performed_on", today)
      .order("id").range(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error(error)
      return { error: t("Nu am putut încărca mesele.", "Could not load your meals.") }
    }
    for (const item of data ?? []) {
      const meal = item.meals as unknown as { performed_on: string }
      kcalByDay.set(meal.performed_on, (kcalByDay.get(meal.performed_on) ?? 0) + Number(item.total_kcal))
    }
    if (!data || data.length < PAGE_SIZE) break
  }

  const p = profile.data
  return {
    input: {
      sex: p?.sex === "male" || p?.sex === "female" ? p.sex : null,
      heightCm: p?.height_cm ? Number(p.height_cm) : null,
      birthDate: p?.birth_date ?? null,
      activityLevel: p?.activity_level in ACTIVITY_LEVELS ? p!.activity_level as ActivityLevel : null,
      goalKgPerWeek: Number(p?.goal_kg_per_week ?? 0),
      weights: (weights.data ?? []).map((w) => ({ date: w.date, weightKg: Number(w.weight_kg) })),
      intake: [...kcalByDay].map(([date, kcal]) => ({ date, kcal })).sort((a, b) => a.date.localeCompare(b.date)),
    },
  }
}

export async function saveEnergyGoal(activityLevel: string, goalKgPerWeek: number) {
  const { t } = await getLanguage()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: t("Neautorizat", "Not signed in") }

  if (!(activityLevel in ACTIVITY_LEVELS)) return { error: t("Nivel de activitate invalid.", "Invalid activity level.") }
  if (!Number.isFinite(goalKgPerWeek) || goalKgPerWeek < -1 || goalKgPerWeek > 1) {
    return { error: t("Ritm invalid.", "Invalid rate.") }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ activity_level: activityLevel, goal_kg_per_week: Math.round(goalKgPerWeek * 100) / 100 })
    .eq("id", user.id)
  if (error) return { error: error.message }
  return { success: true }
}
