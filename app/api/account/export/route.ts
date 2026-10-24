import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { localDate } from "@/lib/daily-metrics"

export const dynamic = "force-dynamic"
const headers = { "Cache-Control": "private, no-store" }
const PAGE_SIZE = 1000

// GDPR data portability: everything stored about the signed-in user, in the format /api/account/import reads.
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: "Sign in again to export your data." }, { status: 401, headers })

  // Supabase returns at most 1000 rows per request, so read every table page by page.
  async function all(table: string, order: string, column = "user_id", select = "*") {
    const rows: Record<string, unknown>[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase.from(table).select(select).eq(column, user!.id).order(order).range(from, from + PAGE_SIZE - 1)
      if (error) throw new Error(`${table}: ${error.message}`)
      rows.push(...((data ?? []) as unknown as Record<string, unknown>[]))
      if (!data || data.length < PAGE_SIZE) return rows
    }
  }

  try {
    const [profile, targets, draft, workouts, sets, cardio, meals, mealItems, ownFoods, templates, steps, weights] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("user_targets").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("workout_drafts").select("draft, client_updated_at, updated_at").eq("user_id", user.id).maybeSingle(),
      all("workouts", "id"),
      all("workout_sets", "id"),
      all("cardio_sessions", "id"),
      all("meals", "id"),
      // meal_items has no user_id; it belongs to the user through its meal.
      all("meal_items", "id", "meals.user_id", "*, meals!inner(user_id)"),
      all("foods", "id"),
      all("meal_templates", "id"),
      all("daily_steps", "date"),
      all("daily_weight", "date"),
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

    const body = {
      format: "replog-export",
      version: 1,
      exported_at: new Date().toISOString(),
      account: { id: user.id, email: user.email, created_at: user.created_at },
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
    }
    return new NextResponse(JSON.stringify(body, null, 2), {
      headers: {
        ...headers,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="replog-export-${localDate()}.json"`,
      },
    })
  } catch (error) {
    console.error("Export failed:", error)
    return NextResponse.json({ error: "Export failed. Please try again." }, { status: 500, headers })
  }
}
