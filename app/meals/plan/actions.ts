"use server";

import { revalidatePath } from "next/cache";
import { getLanguage } from "@/app/language";
import { toDiaryMealType } from "@/lib/coach/meal-plans";
import { localDate } from "@/lib/daily-metrics";
import { createClient } from "@/lib/supabase/server";

export async function logPlanMealTodayAction(
  mealId: string,
): Promise<{ success?: boolean; error?: string }> {
  const { t } = await getLanguage();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("Neautorizat", "Not signed in") };

  // RLS on meal_plan_meals / meal_plan_items guarantees the client can only read meals from their active plans.
  const { data: planMeal, error: mealErr } = await supabase
    .from("meal_plan_meals")
    .select(
      "id, position, meal_type, title, meal_plan_items(id, position, food_id, name, brand, grams, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g)",
    )
    .eq("id", mealId)
    .maybeSingle();

  if (mealErr) return { error: mealErr.message };
  if (!planMeal) {
    return { error: t("Masa din plan nu a fost găsită.", "Plan meal not found.") };
  }

  type PlanItemRow = {
    id: string;
    position: number;
    food_id: string | null;
    name: string;
    brand: string | null;
    grams: number | string;
    kcal_per_100g: number | string;
    protein_per_100g: number | string;
    carbs_per_100g: number | string;
    fat_per_100g: number | string;
    fiber_per_100g: number | string | null;
  };

  const items = ([...(planMeal.meal_plan_items ?? [])] as PlanItemRow[]).sort(
    (a, b) => a.position - b.position,
  );
  if (items.length === 0) {
    return { error: t("Această masă nu conține alimente.", "This meal has no foods.") };
  }

  const today = localDate();
  const { data: createdMeal, error: insertMealErr } = await supabase
    .from("meals")
    .insert({
      user_id: user.id,
      performed_on: today,
      meal_type: toDiaryMealType(planMeal.meal_type as string, Number(planMeal.position) || 1),
      notes: planMeal.title as string,
    })
    .select("id")
    .single();

  if (insertMealErr) return { error: insertMealErr.message };
  const loggedMealId = createdMeal.id as string;

  for (const item of items) {
    let resolvedFoodId: string | null = null;

    // Check if the referenced food_id is readable by this client (shared catalog or client's own food).
    if (item.food_id) {
      const { data: readableFood } = await supabase
        .from("foods")
        .select("id")
        .eq("id", item.food_id)
        .maybeSingle();
      if (readableFood?.id) resolvedFoodId = readableFood.id as string;
    }

    if (!resolvedFoodId) {
      // Create a private food entry for the client using the plan snapshot macros.
      const { data: newFood, error: foodErr } = await supabase
        .from("foods")
        .insert({
          user_id: user.id,
          name: item.name,
          brand: item.brand || "Plan alimentar",
          kcal_per_100g: Number(item.kcal_per_100g) || 0,
          protein_per_100g: Number(item.protein_per_100g) || 0,
          carbs_per_100g: Number(item.carbs_per_100g) || 0,
          fat_per_100g: Number(item.fat_per_100g) || 0,
          fiber_per_100g: item.fiber_per_100g === null ? 0 : Number(item.fiber_per_100g) || 0,
        })
        .select("id")
        .single();

      if (foodErr) return { error: foodErr.message };
      resolvedFoodId = newFood.id as string;
    }

    const grams = Number(item.grams) || 0;
    const multiplier = grams / 100;
    const { error: itemErr } = await supabase.from("meal_items").insert({
      meal_id: loggedMealId,
      food_id: resolvedFoodId,
      consumed_weight_g: grams,
      total_kcal: Math.round((Number(item.kcal_per_100g) || 0) * multiplier),
      total_protein_g: Math.round((Number(item.protein_per_100g) || 0) * multiplier * 10) / 10,
      total_carbs_g: Math.round((Number(item.carbs_per_100g) || 0) * multiplier * 10) / 10,
      total_fat_g: Math.round((Number(item.fat_per_100g) || 0) * multiplier * 10) / 10,
    });
    if (itemErr) return { error: itemErr.message };
  }

  revalidatePath("/meals");
  revalidatePath("/meals/history");
  revalidatePath("/meals/progress");
  return { success: true };
}

export async function applyMealPlanTargetsAction(
  planId: string,
): Promise<{ success?: boolean; error?: string }> {
  const { t } = await getLanguage();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("Neautorizat", "Not signed in") };

  const [{ data: plan, error: planErr }, { data: existingTargets }] = await Promise.all([
    supabase
      .from("meal_plans")
      .select("target_kcal, target_protein_g, target_carbs_g, target_fat_g, target_fiber_g")
      .eq("id", planId)
      .maybeSingle(),
    supabase
      .from("user_targets")
      .select("kcal, protein, carbs, fat, fiber")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (planErr) return { error: planErr.message };
  if (!plan) return { error: t("Planul alimentar nu a fost găsit.", "Meal plan not found.") };

  const { error: upsertErr } = await supabase.from("user_targets").upsert({
    user_id: user.id,
    kcal: plan.target_kcal ?? existingTargets?.kcal ?? 2200,
    protein: plan.target_protein_g ?? existingTargets?.protein ?? 160,
    carbs: plan.target_carbs_g ?? existingTargets?.carbs ?? 250,
    fat: plan.target_fat_g ?? existingTargets?.fat ?? 70,
    fiber: plan.target_fiber_g ?? existingTargets?.fiber ?? 30,
    updated_at: new Date().toISOString(),
  });

  if (upsertErr) return { error: upsertErr.message };

  revalidatePath("/meals");
  revalidatePath("/meals/plan");
  revalidatePath("/meals/progress");
  revalidatePath("/meals/progress/targets");
  return { success: true };
}
