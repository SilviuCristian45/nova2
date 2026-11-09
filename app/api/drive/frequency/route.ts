import { NextResponse } from "next/server"
import { isAutoBackupFrequency } from "@/lib/drive-backup"
import { backupUser, getDriveStatus, setDriveFrequency } from "@/lib/drive-service"
import { driveUser, failure, noStore } from "../session"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Changes how often backups run; if one is already due with the new frequency, it runs right away.
export async function POST(request: Request) {
  const session = await driveUser()
  if ("response" in session) return session.response
  const { frequency } = await request.json().catch(() => ({})) as { frequency?: unknown }
  if (!isAutoBackupFrequency(frequency)) return NextResponse.json({ error: "Invalid frequency." }, { status: 400, headers: noStore })
  try {
    await setDriveFrequency(session.user.id, frequency)
    const result = frequency === "off" ? { status: "skipped" as const } : await backupUser(session.user.id, false)
    return NextResponse.json({ result, status: await getDriveStatus(session.user.id) }, { headers: noStore })
  } catch (error) {
    return failure(error)
  }
}
