import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getLanguage } from "@/app/language"

export const dynamic = "force-dynamic"
const headers = { "Cache-Control": "private, no-store" }
const MAX_BYTES = 20_000_000

// Reads a file produced by /api/account/export. The database function validates and imports it all or nothing.
export async function POST(request: Request) {
  const { t } = await getLanguage()
  if (Number(request.headers.get("content-length")) > MAX_BYTES) {
    return NextResponse.json({ error: t("Fișierul este prea mare (maxim 20 MB).", "The file is too large (max 20 MB).") }, { status: 413, headers })
  }
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: t("Autentifică-te din nou pentru import.", "Sign in again to import your data.") }, { status: 401, headers })

  const text = await request.text()
  if (text.length > MAX_BYTES) return NextResponse.json({ error: t("Fișierul este prea mare (maxim 20 MB).", "The file is too large (max 20 MB).") }, { status: 413, headers })
  let data: unknown
  try { data = JSON.parse(text) }
  catch { return NextResponse.json({ error: t("Fișierul nu este un JSON valid.", "The file is not valid JSON.") }, { status: 400, headers }) }
  if (typeof data !== "object" || data === null || (data as { format?: unknown }).format !== "replog-export") {
    return NextResponse.json({ error: t("Acesta nu este un fișier de export RepLog.", "This is not a RepLog export file.") }, { status: 400, headers })
  }

  const { data: counts, error: importError } = await supabase.rpc("import_my_data", { p_data: data })
  if (importError) {
    console.error("Import failed:", importError)
    return NextResponse.json({ error: t("Nu s-a importat nimic: ", "Nothing was imported: ") + importError.message }, { status: 400, headers })
  }
  revalidatePath("/", "layout")
  return NextResponse.json({ success: true, counts }, { headers })
}
