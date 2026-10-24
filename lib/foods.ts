import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"

// Barcode products go into the shared catalog (user_id null) so every user can scan them.
// Nutrition always comes from Open Food Facts, never from the client, so nobody can poison the catalog.
export async function getOrCacheBarcodeFood(barcode: string) {
  if (!/^\d{4,20}$/.test(barcode)) return null
  const admin = createAdminClient()

  const { data: cached, error } = await admin.from("foods").select("*").eq("barcode", barcode).maybeSingle()
  if (error) throw error
  if (cached) return cached

  const offResponse = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`)
  const offData = await offResponse.json()
  if (offData.status !== 1) return null

  const p = offData.product
  const nutriments = p.nutriments || {}
  const { data: saved, error: saveError } = await admin
    .from("foods")
    .upsert({
      user_id: null,
      name: p.product_name_ro || p.product_name || "Produs Necunoscut",
      brand: p.brands || "Fără Brand",
      barcode,
      kcal_per_100g: nutriments["energy-kcal_100g"] || 0,
      protein_per_100g: nutriments["proteins_100g"] || 0,
      carbs_per_100g: nutriments["carbohydrates_100g"] || 0,
      fat_per_100g: nutriments["fat_100g"] || 0,
      saturated_fat_per_100g: nutriments["saturated-fat_100g"] || 0,
      fiber_per_100g: nutriments["fiber_100g"] || 0,
      sodium_mg_per_100g: nutriments["sodium_100g"] ? nutriments["sodium_100g"] * 1000 : 0,
    }, { onConflict: "barcode", ignoreDuplicates: false })
    .select()
    .single()
  if (saveError) throw saveError
  return saved
}
