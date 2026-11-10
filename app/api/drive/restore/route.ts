import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { driveClientFor } from "@/lib/drive-service"
import { driveUser, failure, noStore } from "../session"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const SECTIONS = ["workouts", "workout_sets", "cardio_sessions", "meals", "meal_items", "foods", "meal_templates", "daily_steps", "daily_weight", "daily_checkin"] as const

// Restores a Drive backup in merge mode, like /api/account/import. Without `confirm` it only returns a preview
// (what the file holds); with `confirm: true` the file is imported by import_my_data with the user's own
// session (the function uses auth.uid()), all or nothing. Existing entries are never overwritten.
export async function POST(request: Request) {
  const session = await driveUser()
  if ("response" in session) return session.response
  const { id, confirm } = await request.json().catch(() => ({})) as { id?: unknown; confirm?: unknown }
  if (typeof id !== "string" || !id) return NextResponse.json({ error: "Missing file id." }, { status: 400, headers: noStore })

  let data: Record<string, unknown>
  try {
    data = JSON.parse(await (await driveClientFor(session.user.id)).downloadBackup(id))
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "The Drive backup is not valid JSON." }, { status: 400, headers: noStore })
    return failure(error)
  }
  if (typeof data !== "object" || data === null || data.format !== "replog-export") {
    return NextResponse.json({ error: "The Drive backup is not a RepLog export." }, { status: 400, headers: noStore })
  }

  if (confirm !== true) {
    const counts = Object.fromEntries(SECTIONS.map((section) => [section, Array.isArray(data[section]) ? (data[section] as unknown[]).length : 0]))
    return NextResponse.json({ preview: { exportedAt: typeof data.exported_at === "string" ? data.exported_at : null, counts } }, { headers: noStore })
  }

  const { data: counts, error } = await session.supabase.rpc("import_my_data", { p_data: data })
  if (error) {
    console.error("Drive restore failed:", error)
    return NextResponse.json({ error: error.message }, { status: 400, headers: noStore })
  }
  revalidatePath("/", "layout")
  return NextResponse.json({ success: true, counts }, { headers: noStore })
}
