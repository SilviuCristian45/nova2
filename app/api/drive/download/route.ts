import { NextResponse, type NextRequest } from "next/server"
import { driveClientFor } from "@/lib/drive-service"
import { driveUser, failure, noStore } from "../session"

export const dynamic = "force-dynamic"

// Hands one Drive backup to the browser as a normal file download.
export async function GET(request: NextRequest) {
  const session = await driveUser()
  if ("response" in session) return session.response
  const id = request.nextUrl.searchParams.get("id")
  const name = (request.nextUrl.searchParams.get("name") ?? "replog-backup.json").replace(/[^\w.-]/g, "_")
  if (!id) return NextResponse.json({ error: "Missing file id." }, { status: 400, headers: noStore })
  try {
    const text = await (await driveClientFor(session.user.id)).downloadBackup(id)
    return new NextResponse(text, {
      headers: { ...noStore, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
    })
  } catch (error) {
    return failure(error)
  }
}
