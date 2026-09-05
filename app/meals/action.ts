"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// Funcție pentru salvarea în masă a unei liste de alimente
export async function saveCompleteMeal(mealType: string, items: any[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Neautorizat" }

  if (!items || items.length === 0) return { error: "Masa este goală." }

  try {
    const today = new Date().toISOString().split('T')[0]
    
    // 1. Creăm o înregistrare NOUĂ pentru masă
    const { data: newMeal, error: mealError } = await supabase
      .from("meals")
      .insert({ user_id: user.id, performed_on: today, meal_type: mealType })
      .select("id")
      .single()
      
    if (mealError) throw mealError
    const mealId = newMeal.id

    // 2. Trecem prin fiecare aliment din ciorna (draft)
    for (const item of items) {
      const { food, grams } = item
      let foodId = food.id

      // Upsert produs în catalogul local (dacă vine din Open Food Facts)
      if (!foodId && food.barcode) {
        const { data: existingFood } = await supabase
          .from("foods")
          .select("id")
          .eq("barcode", food.barcode)
          .single()

        if (existingFood) {
          foodId = existingFood.id
        } else {
          const { data: newFood, error: insertError } = await supabase
            .from("foods")
            .insert({
              user_id: user.id,
              name: food.name,
              brand: food.brand,
              barcode: food.barcode,
              kcal_per_100g: food.kcal_per_100g || 0,
              protein_per_100g: food.protein_per_100g || 0,
              carbs_per_100g: food.carbs_per_100g || 0,
              fat_per_100g: food.fat_per_100g || 0,
              fiber_per_100g: food.fiber_per_100g || 0
            })
            .select("id")
            .single()
            
          if (insertError) throw insertError
          foodId = newFood.id
        }
      }

      // 3. Calculăm macros și inserăm alimentul în masa tocmai creată
      const multiplier = grams / 100
      const { error: itemError } = await supabase
        .from("meal_items")
        .insert({
          meal_id: mealId,
          food_id: foodId,
          consumed_weight_g: grams,
          total_kcal: Math.round(food.kcal_per_100g * multiplier),
          total_protein_g: Math.round((food.protein_per_100g * multiplier) * 10) / 10,
          total_carbs_g: Math.round((food.carbs_per_100g * multiplier) * 10) / 10,
          total_fat_g: Math.round((food.fat_per_100g * multiplier) * 10) / 10,
        })

      if (itemError) throw itemError
    }

    revalidatePath("/meals")
    revalidatePath("/meals/history")
    return { success: true }
  } catch (error: any) {
    console.error("Eroare la salvarea mesei:", error)
    return { error: error.message || "A apărut o eroare la salvare." }
  }
}