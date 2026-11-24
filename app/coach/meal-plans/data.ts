import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeMealPlanRow,
  type MealPlanDocument,
  type RawMealPlanQueryRow,
} from "@/lib/coach/meal-plans";

export type ActiveClientOption = {
  id: string;
  name: string;
};

export const MEAL_PLAN_NESTED_SELECT = `
  id, coach_id, assigned_client_id, title, description, goal, status,
  target_kcal, target_protein_g, target_carbs_g, target_fat_g, target_fiber_g,
  water_liters, notes, share_token, updated_at,
  meal_plan_days (
    id, position, title, notes,
    meal_plan_meals (
      id, position, meal_type, title, time_label, notes,
      meal_plan_items (
        id, position, food_id, name, brand, grams,
        kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g, notes
      )
    )
  )
`;

export async function getCoachActiveClients(
  supabase: SupabaseClient,
  coachId: string,
): Promise<ActiveClientOption[]> {
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("client_id")
    .eq("coach_id", coachId)
    .eq("status", "active");

  const clientIds = [...new Set((enrollments ?? []).map((e) => e.client_id as string))];
  if (clientIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", clientIds);

  const nameMap = new Map<string, string>();
  for (const p of profiles ?? []) {
    const display = (p.display_name as string | null)?.trim();
    if (display) nameMap.set(p.id as string, display);
  }

  return clientIds
    .map((id) => ({
      id,
      name: nameMap.get(id) ?? `Client #${id.slice(0, 6)}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCoachMealPlanById(
  supabase: SupabaseClient,
  coachId: string,
  planId: string,
  coachName: string,
): Promise<MealPlanDocument | null> {
  const { data } = await supabase
    .from("meal_plans")
    .select(MEAL_PLAN_NESTED_SELECT)
    .eq("id", planId)
    .eq("coach_id", coachId)
    .maybeSingle();

  if (!data) return null;
  const row = data as unknown as RawMealPlanQueryRow;

  let clientName: string | null = null;
  if (row.assigned_client_id) {
    const { data: clientProf } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", row.assigned_client_id)
      .maybeSingle();
    clientName =
      (clientProf?.display_name as string | null)?.trim() ||
      `Client #${row.assigned_client_id.slice(0, 6)}`;
  }

  return normalizeMealPlanRow(row, { coachName, clientName });
}
