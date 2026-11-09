import "server-only"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { driveConfigured } from "@/lib/google-drive"

export const noStore = { "Cache-Control": "private, no-store" }
// OAuth state + PKCE verifier between /api/drive/connect and /api/drive/callback.
export const STATE_COOKIE = "drive_oauth"

// The signed-in user for a Drive route, or the response to send back instead.
export async function driveUser() {
  if (!driveConfigured()) return { response: NextResponse.json({ error: "Google Drive is not configured." }, { status: 404, headers: noStore }) }
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { response: NextResponse.json({ error: "Sign in again." }, { status: 401, headers: noStore }) }
  return { user, supabase }
}

export function failure(error: unknown, status = 500) {
  console.error("Drive request failed:", error)
  return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status, headers: noStore })
}
