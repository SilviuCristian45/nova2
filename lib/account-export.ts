import type { SupabaseClient } from "@supabase/supabase-js"

const PAGE_SIZE = 1000

export type ExportAccount = { id: string; email?: string | null; created_at?: string | null }
// The Google Drive link as it appears in an export: never the refresh token.
export type ExportDriveBackup = { email: string | null; frequency: string; last_backup_at: string | null }

// GDPR data portability: everything stored about one user, in the "replog-export" v1 format that
// /api/account/import (and the mobile app) read. Every query filters on the user's id explicitly, so this works
// with the signed-in user's client (the export route) and with the service-role client (the Drive backup cron).
// The Drive link table is readable only with the service-role key, so the caller passes it in (`driveBackup`).
export async function buildExport(supabase: SupabaseClient, account: ExportAccount, driveBackup: ExportDriveBackup | null = null) {
  const userId = account.id

  // Supabase returns at most 1000 rows per request, so read every table page by page.
  async function all(table: string, order: string, column = "user_id", select = "*") {
    const rows: Record<string, unknown>[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase.from(table).select(select).eq(column, userId).order(order).range(from, from + PAGE_SIZE - 1)
      if (error) throw new Error(`${table}: ${error.message}`)
      rows.push(...((data ?? []) as unknown as Record<string, unknown>[]))
      if (!data || data.length < PAGE_SIZE) return rows
    }
  }

  // The check-in table arrives with its own migration: an account without it still exports everything else.
  const checkins = () => all("daily_checkin", "date").catch((error: Error) =>
    /schema cache|does not exist/.test(error.message) ? [] : Promise.reject(error))

  const [profile, targets, draft, workouts, sets, cardio, meals, mealItems, ownFoods, templates, steps, weights, dailyCheckin] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("user_targets").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("workout_drafts").select("draft, client_updated_at, updated_at").eq("user_id", userId).maybeSingle(),
    all("workouts", "id"),
    all("workout_sets", "id"),
    all("cardio_sessions", "id"),
    all("meals", "id"),
    // meal_items has no user_id; it belongs to the user through its meal (inner join, filtered on the meal's owner).
    all("meal_items", "id", "meals.user_id", "*, meals!inner(user_id)"),
    all("foods", "id"),
    all("meal_templates", "id"),
    all("daily_steps", "date"),
    all("daily_weight", "date"),
    checkins(),
  ])
  for (const single of [profile, targets, draft]) if (single.error) throw new Error(single.error.message)

  // Include the shared catalog foods the user's meals point at, so the file is complete on its own.
  const ownIds = new Set(ownFoods.map((food) => food.id))
  const catalogIds = [...new Set(mealItems.map((item) => item.food_id as string))].filter((id) => !ownIds.has(id))
  const catalogFoods: Record<string, unknown>[] = []
  for (let i = 0; i < catalogIds.length; i += 200) {
    const { data, error } = await supabase.from("foods").select("*").in("id", catalogIds.slice(i, i + 200))
    if (error) throw new Error(`foods: ${error.message}`)
    catalogFoods.push(...(data ?? []))
  }

  return {
    format: "replog-export",
    version: 1,
    exported_at: new Date().toISOString(),
    account: { id: userId, email: account.email, created_at: account.created_at },
    profile: profile.data,
    user_targets: targets.data,
    workout_draft: draft.data,
    workouts,
    workout_sets: sets,
    cardio_sessions: cardio,
    meals,
    meal_items: mealItems.map((item) => Object.fromEntries(Object.entries(item).filter(([key]) => key !== "meals"))),
    foods: [...ownFoods, ...catalogFoods],
    meal_templates: templates,
    daily_steps: steps,
    daily_weight: weights,
    daily_checkin: dailyCheckin,
    google_drive_backup: driveBackup
      ? { email: driveBackup.email, frequency: driveBackup.frequency, last_backup_at: driveBackup.last_backup_at }
      : null,
  }
}
