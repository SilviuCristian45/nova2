import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: barcode } = await params

  if (!barcode) {
    return NextResponse.json({ error: "Codul de bare lipsește" }, { status: 400 })
  }

  const supabase = await createClient()
  
  // 1. Preluăm utilizatorul curent (pentru a-i putea asocia produsul dacă e nou)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 })
  }

  try {
    // 2. Verificăm CACHE-UL LOCAL
    const { data: localFood, error: localError } = await supabase
      .from("foods")
      .select("*")
      .eq("barcode", barcode)
      .single()

    if (localFood) {
      return NextResponse.json({ source: "local_db", data: localFood })
    }

    // 3. Facem call la Open Food Facts
    const offResponse = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`)
    const offData = await offResponse.json()

    if (offData.status !== 1) {
      return NextResponse.json({ error: "Produsul nu a fost găsit în baza globală." }, { status: 404 })
    }

    const p = offData.product
    const nutriments = p.nutriments || {}

    // 4. Mapăm datele
    const newFood = {
      user_id: user.id, // Adăugăm ID-ul tău ca să trecem de securitatea RLS!
      name: p.product_name_ro || p.product_name || "Produs Necunoscut",
      brand: p.brands || "Fără Brand",
      barcode: barcode,
      kcal_per_100g: nutriments["energy-kcal_100g"] || 0,
      protein_per_100g: nutriments["proteins_100g"] || 0,
      carbs_per_100g: nutriments["carbohydrates_100g"] || 0,
      fat_per_100g: nutriments["fat_100g"] || 0,
      saturated_fat_per_100g: nutriments["saturated-fat_100g"] || 0,
      fiber_per_100g: nutriments["fiber_100g"] || 0,
      sodium_mg_per_100g: nutriments["sodium_100g"] ? nutriments["sodium_100g"] * 1000 : 0
    }

    // 5. Salvăm produsul în DB
    const { data: savedFood, error: saveError } = await supabase
      .from("foods")
      .insert(newFood)
      .select()
      .single()

    if (saveError) {
      console.error("Eroare la salvare în DB:", saveError)
      return NextResponse.json({ error: "Produsul a fost găsit, dar nu a putut fi salvat." }, { status: 500 })
    }

    // 6. Returnăm noul produs
    return NextResponse.json({ source: "open_food_facts_api", data: savedFood })

  } catch (error) {
    console.error("API Error:", error)
    return NextResponse.json({ error: "Eroare internă" }, { status: 500 })
  }
}