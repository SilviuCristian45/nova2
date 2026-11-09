import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { localDate } from "@/lib/daily-metrics"
import { buildExport } from "@/lib/account-export"

export const dynamic = "force-dynamic"
const headers = { "Cache-Control": "private, no-store" }

// GDPR data portability: everything stored about the signed-in user, in the format /api/account/import reads.
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: "Sign in again to export your data." }, { status: 401, headers })

  try {
    const body = await buildExport(supabase, user)
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
