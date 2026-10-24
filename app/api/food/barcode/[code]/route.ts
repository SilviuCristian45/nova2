import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getOrCacheBarcodeFood } from "@/lib/foods"

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: barcode } = await params

  if (!barcode) {
    return NextResponse.json({ error: "Codul de bare lipsește" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 })
  }

  try {
    // Catalogul comun e cache-ul local; dacă produsul lipsește, îl aducem din Open Food Facts
    const food = await getOrCacheBarcodeFood(barcode)
    if (!food) {
      return NextResponse.json({ error: "Produsul nu a fost găsit în baza globală." }, { status: 404 })
    }
    return NextResponse.json({ data: food })
  } catch (error) {
    console.error("API Error:", error)
    return NextResponse.json({ error: "Eroare internă" }, { status: 500 })
  }
}
