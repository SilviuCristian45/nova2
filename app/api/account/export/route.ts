import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { localDate } from "@/lib/daily-metrics"
import { buildExport, type ExportDriveBackup } from "@/lib/account-export"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
const headers = { "Cache-Control": "private, no-store" }

// The Drive link (without its token) lives in a service-role-only table. Without the key there is no Drive feature.
async function driveBackupFor(userId: string): Promise<ExportDriveBackup | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null
  const { data, error } = await createAdminClient().from("google_drive_backups")
    .select("email, frequency, last_backup_at").eq("user_id", userId).maybeSingle()
  // Table not created yet (migration 202611090001 not run): there is nothing to export.
  if (error && (error.code === "PGRST205" || error.code === "42P01")) return null
  if (error) throw new Error(`google_drive_backups: ${error.message}`)
  return data
}

// GDPR data portability: everything stored about the signed-in user, in the format /api/account/import reads.
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: "Sign in again to export your data." }, { status: 401, headers })

  try {
    const body = await buildExport(supabase, user, await driveBackupFor(user.id))
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
