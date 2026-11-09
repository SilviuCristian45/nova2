import { timingSafeEqual } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { backupAllDue } from "@/lib/drive-service"
import { driveConfigured } from "@/lib/google-drive"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Hourly job (a cron container with curl on the VPS, or vercel.json "crons"): backs up every link that is due.
// Protected with "Authorization: Bearer $CRON_SECRET". Vercel crons send GET; curl can send either.
async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!driveConfigured()) return NextResponse.json({ error: "Google Drive is not configured." }, { status: 404 })
  try {
    // Leaves a margin under maxDuration for the backup still running when the budget ends.
    return NextResponse.json(await backupAllDue(200_000))
  } catch (error) {
    console.error("Drive cron failed:", error)
    return NextResponse.json({ error: "Cron run failed." }, { status: 500 })
  }
}

export const GET = run
export const POST = run
