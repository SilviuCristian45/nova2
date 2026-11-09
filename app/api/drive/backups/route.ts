import { NextResponse } from "next/server"
import { driveClientFor } from "@/lib/drive-service"
import { driveUser, failure, noStore } from "../session"

export const dynamic = "force-dynamic"

// The backups in the app folder of the user's Drive (shared by the phone and the web), newest first.
export async function GET() {
  const session = await driveUser()
  if ("response" in session) return session.response
  try {
    const files = await (await driveClientFor(session.user.id)).listBackups()
    return NextResponse.json({ files }, { headers: noStore })
  } catch (error) {
    return failure(error)
  }
}
