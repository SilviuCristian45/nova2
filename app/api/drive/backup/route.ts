import { NextResponse } from "next/server"
import { backupUser, getDriveStatus } from "@/lib/drive-service"
import { driveUser, failure, noStore } from "../session"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// "Back up now": always uploads, whatever the frequency.
export async function POST() {
  const session = await driveUser()
  if ("response" in session) return session.response
  try {
    const result = await backupUser(session.user.id, true)
    return NextResponse.json({ result, status: await getDriveStatus(session.user.id) }, { headers: noStore })
  } catch (error) {
    return failure(error)
  }
}
