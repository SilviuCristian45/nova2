import { NextResponse } from "next/server"
import { backupUser, getDriveStatus } from "@/lib/drive-service"
import { driveConfigured } from "@/lib/google-drive"
import { createClient } from "@/lib/supabase/server"
import { noStore } from "../session"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Called quietly when the app opens (at most once per browser session): catches up a backup the cron missed.
// Does nothing when Drive is not configured, not connected or not due.
export async function POST() {
  const nothing = () => new NextResponse(null, { status: 204, headers: noStore })
  if (!driveConfigured()) return nothing()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return nothing()
  try {
    const status = await getDriveStatus(user.id)
    if (!status.connected || status.frequency === "off") return nothing()
    return NextResponse.json({ result: await backupUser(user.id, false) }, { headers: noStore })
  } catch (error) {
    console.error("Drive catch-up backup failed:", error)
    return nothing()
  }
}
