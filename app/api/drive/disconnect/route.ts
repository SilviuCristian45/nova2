import { NextResponse } from "next/server"
import { removeDriveLink } from "@/lib/drive-service"
import { driveUser, failure, noStore } from "../session"

export const dynamic = "force-dynamic"

// Revokes the Google token and forgets the link, so automatic backups stop.
export async function POST() {
  const session = await driveUser()
  if ("response" in session) return session.response
  try {
    await removeDriveLink(session.user.id)
    return NextResponse.json({ status: { connected: false, email: null, frequency: "off", lastBackupAt: null, lastError: null } }, { headers: noStore })
  } catch (error) {
    return failure(error)
  }
}
