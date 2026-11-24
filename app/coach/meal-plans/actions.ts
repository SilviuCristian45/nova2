"use server";

import { revalidatePath } from "next/cache";
import { getLanguage } from "@/app/language";
import { requireCoach } from "@/lib/coach/auth";
import {
  generateShareToken,
  validateMealPlanPayload,
  type MealPlanPayloadInput,
} from "@/lib/coach/meal-plans";

export type SaveMealPlanResult = {
  error?: string;
  success?: boolean;
  planId?: string;
};

export async function saveMealPlanAction(
  input: MealPlanPayloadInput,
  options?: { notifyClient?: boolean },
): Promise<SaveMealPlanResult> {
  const { t } = await getLanguage();
  const coach = await requireCoach();
  const checked = validateMealPlanPayload(input, t);
  if (!checked.ok) return { error: checked.error };

  const data = checked.data;
  const supabase = coach.supabase;

  // Verify active coach-client relationship if assigned to a client.
  if (data.assignedClientId) {
    const { data: activeEnrollment } = await supabase
      .from("enrollments")
      .select("id")
      .eq("coach_id", coach.userId)
      .eq("client_id", data.assignedClientId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!activeEnrollment) {
      return {
        error: t(
          "Poți asigna planul doar unui client cu înscriere activă.",
          "You can only assign a meal plan to a client with an active enrollment.",
        ),
      };
    }
  }

  let planId = data.id;
  let wasAlreadyActiveForSameClient = false;

  if (planId) {
    const { data: existingPlan } = await supabase
      .from("meal_plans")
      .select("id, status, assigned_client_id")
      .eq("id", planId)
      .eq("coach_id", coach.userId)
      .maybeSingle();

    if (!existingPlan) {
      return { error: t("Planul alimentar nu a fost găsit.", "Meal plan not found.") };
    }

    wasAlreadyActiveForSameClient =
      existingPlan.status === "active" &&
      existingPlan.assigned_client_id !== null &&
      existingPlan.assigned_client_id === data.assignedClientId;

    const { error: updateError } = await supabase
      .from("meal_plans")
      .update({
        assigned_client_id: data.assignedClientId,
        title: data.title,
        description: data.description,
        goal: data.goal,
        status: data.status,
        target_kcal: data.targetKcal,
        target_protein_g: data.targetProteinG,
        target_carbs_g: data.targetCarbsG,
        target_fat_g: data.targetFatG,
        target_fiber_g: data.targetFiberG,
        water_liters: data.waterLiters,
        notes: data.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", planId)
      .eq("coach_id", coach.userId);

    if (updateError) return { error: updateError.message };
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("meal_plans")
      .insert({
        coach_id: coach.userId,
        assigned_client_id: data.assignedClientId,
        title: data.title,
        description: data.description,
        goal: data.goal,
        status: data.status,
        target_kcal: data.targetKcal,
        target_protein_g: data.targetProteinG,
        target_carbs_g: data.targetCarbsG,
        target_fat_g: data.targetFatG,
        target_fiber_g: data.targetFiberG,
        water_liters: data.waterLiters,
        notes: data.notes,
      })
      .select("id")
      .single();

    if (insertError) return { error: insertError.message };
    planId = inserted.id as string;
  }

  // Replace days -> meals -> items cleanly (child tables cascade on day delete).
  const { error: delDaysError } = await supabase
    .from("meal_plan_days")
    .delete()
    .eq("meal_plan_id", planId);
  if (delDaysError) return { error: delDaysError.message };

  for (let di = 0; di < data.days.length; di++) {
    const day = data.days[di];
    const { data: dayRow, error: dayErr } = await supabase
      .from("meal_plan_days")
      .insert({
        meal_plan_id: planId,
        position: di + 1,
        title: day.title,
        notes: day.notes || null,
      })
      .select("id")
      .single();
    if (dayErr) return { error: dayErr.message };
    const dayId = dayRow.id as string;

    for (let mi = 0; mi < day.meals.length; mi++) {
      const meal = day.meals[mi];
      const { data: mealRow, error: mealErr } = await supabase
        .from("meal_plan_meals")
        .insert({
          meal_plan_day_id: dayId,
          position: mi + 1,
          meal_type: meal.mealType,
          title: meal.title,
          time_label: meal.timeLabel || null,
          notes: meal.notes || null,
        })
        .select("id")
        .single();
      if (mealErr) return { error: mealErr.message };
      const mealId = mealRow.id as string;

      if (meal.items.length > 0) {
        const { error: itemsErr } = await supabase.from("meal_plan_items").insert(
          meal.items.map((item, ii) => ({
            meal_plan_meal_id: mealId,
            position: ii + 1,
            food_id: item.foodId,
            name: item.name,
            brand: item.brand || null,
            grams: item.grams,
            kcal_per_100g: item.kcalPer100g,
            protein_per_100g: item.proteinPer100g,
            carbs_per_100g: item.carbsPer100g,
            fat_per_100g: item.fatPer100g,
            fiber_per_100g: item.fiberPer100g,
            notes: item.notes || null,
          })),
        );
        if (itemsErr) return { error: itemsErr.message };
      }
    }
  }

  // Optionally notify the client when updating an already-active plan.
  if (options?.notifyClient && wasAlreadyActiveForSameClient && data.status === "active") {
    await supabase.rpc("notify_meal_plan_updated", { p_plan_id: planId });
  }

  revalidatePath("/coach");
  revalidatePath("/coach/meal-plans");
  revalidatePath(`/coach/meal-plans/${planId}`);
  if (data.assignedClientId) {
    revalidatePath(`/coach/clients/${data.assignedClientId}`);
  }
  revalidatePath("/meals");
  revalidatePath("/meals/plan");
  revalidatePath("/");

  return { success: true, planId };
}

export async function deleteMealPlanAction(
  planId: string,
): Promise<{ error?: string; success?: boolean }> {
  const coach = await requireCoach();
  const { data: existing } = await coach.supabase
    .from("meal_plans")
    .select("assigned_client_id")
    .eq("id", planId)
    .eq("coach_id", coach.userId)
    .maybeSingle();

  const { error } = await coach.supabase
    .from("meal_plans")
    .delete()
    .eq("id", planId)
    .eq("coach_id", coach.userId);

  if (error) return { error: error.message };

  revalidatePath("/coach");
  revalidatePath("/coach/meal-plans");
  if (existing?.assigned_client_id) {
    revalidatePath(`/coach/clients/${existing.assigned_client_id as string}`);
  }
  revalidatePath("/meals");
  revalidatePath("/meals/plan");
  revalidatePath("/");
  return { success: true };
}

export async function cloneMealPlanForClientAction(
  planId: string,
  clientId: string,
): Promise<{ error?: string; success?: boolean; planId?: string }> {
  const coach = await requireCoach();

  const { data, error } = await coach.supabase.rpc("clone_meal_plan_for_client", {
    p_plan_id: planId,
    p_client_id: clientId,
  });

  if (error) return { error: error.message };

  const newPlanId = data as string;
  revalidatePath("/coach");
  revalidatePath("/coach/meal-plans");
  revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath("/meals");
  revalidatePath("/meals/plan");
  revalidatePath("/");
  return { success: true, planId: newPlanId };
}

export async function toggleMealPlanShareLinkAction(
  planId: string,
  enable: boolean,
): Promise<{ error?: string; shareToken?: string | null }> {
  const { t } = await getLanguage();
  const coach = await requireCoach();

  if (!enable) {
    const { data, error } = await coach.supabase
      .from("meal_plans")
      .update({ share_token: null, updated_at: new Date().toISOString() })
      .eq("id", planId)
      .eq("coach_id", coach.userId)
      .select("id")
      .maybeSingle();

    if (error) return { error: error.message };
    if (!data) return { error: t("Planul alimentar nu a fost găsit.", "Meal plan not found.") };

    revalidatePath("/coach/meal-plans");
    revalidatePath(`/coach/meal-plans/${planId}`);
    return { shareToken: null };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateShareToken(24);
    const { data, error } = await coach.supabase
      .from("meal_plans")
      .update({ share_token: token, updated_at: new Date().toISOString() })
      .eq("id", planId)
      .eq("coach_id", coach.userId)
      .select("share_token")
      .maybeSingle();

    if (!error && data) {
      revalidatePath("/coach/meal-plans");
      revalidatePath(`/coach/meal-plans/${planId}`);
      return { shareToken: data.share_token as string };
    }
    if (error && error.code !== "23505") {
      return { error: error.message };
    }
  }

  return {
    error: t(
      "Nu s-a putut genera un link unic. Încearcă din nou.",
      "Could not generate a unique link. Please try again.",
    ),
  };
}
