import Link from "next/link";
import { Utensils } from "lucide-react";
import { Text } from "@/app/components/language-provider";
import { getLanguage } from "@/app/language";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeMealPlanRow,
  type MealPlanDocument,
  type RawMealPlanQueryRow,
} from "@/lib/coach/meal-plans";
import { MEAL_PLAN_NESTED_SELECT } from "@/app/coach/meal-plans/data";
import { Empty, Screen, buttonClass } from "@/app/components/ui";
import { ClientMealPlanShell } from "./client-plan-shell";

export const dynamic = "force-dynamic";

export default async function ClientMealPlanPage() {
  const { t } = await getLanguage();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let plans: MealPlanDocument[] = [];

  if (user) {
    const { data: rawPlans } = await supabase
      .from("meal_plans")
      .select(MEAL_PLAN_NESTED_SELECT)
      .eq("assigned_client_id", user.id)
      .eq("status", "active")
      .order("updated_at", { ascending: false });

    const typedRows = (rawPlans ?? []) as unknown as (RawMealPlanQueryRow & { coach_id: string })[];
    const coachIds = [...new Set(typedRows.map((r) => r.coach_id).filter(Boolean))];
    const coachNames = new Map<string, string>();
    if (coachIds.length > 0) {
      const { data: coachProfiles } = await supabase
        .from("coach_profiles")
        .select("user_id, display_name")
        .in("user_id", coachIds);
      for (const cp of coachProfiles ?? []) {
        const name = (cp.display_name as string | null)?.trim();
        if (name) coachNames.set(cp.user_id as string, name);
      }
    }

    const { data: ownProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    const clientName = (ownProfile?.display_name as string | null)?.trim() || null;

    plans = typedRows.map((row) =>
      normalizeMealPlanRow(row, {
        coachName: coachNames.get(row.coach_id) ?? t("Antrenor", "Coach"),
        clientName,
      }),
    );
  }

  return (
    <Screen
      back="/meals"
      title={<Text ro="Plan alimentar" en="Meal plan" />}
    >
      {plans.length === 0 ? (
        <div className="flex flex-col items-center gap-4">
          <Empty icon={Utensils}>
            <Text
              ro="Nu ai încă un plan alimentar activ de la antrenorul tău. Când antrenorul îți asignează un plan, îl vei putea vedea aici, exporta în PDF și loga mesele cu 1 click."
              en="You don't have an active meal plan from your coach yet. Once your coach assigns one, you'll be able to view it here, export PDF, and log meals in 1 click."
            />
          </Empty>
          <Link href="/explore" className={buttonClass({ variant: "secondary", small: true })}>
            <Text ro="Vezi Programe & Antrenori" en="Browse Programs & Coaches" />
          </Link>
        </div>
      ) : (
        <ClientMealPlanShell plans={plans} />
      )}
    </Screen>
  );
}
