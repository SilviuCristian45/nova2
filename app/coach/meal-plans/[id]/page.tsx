import { notFound } from "next/navigation";
import { getLanguage } from "@/app/language";
import { getOwnCoachProfile, requireCoach } from "@/lib/coach/auth";
import { Screen } from "@/app/components/ui";
import { getCoachActiveClients, getCoachMealPlanById } from "../data";
import { MealPlanBuilder } from "../meal-plan-builder";

export const dynamic = "force-dynamic";

export default async function EditMealPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { t } = await getLanguage();
  const coach = await requireCoach();

  const [coachProfile, clients] = await Promise.all([
    getOwnCoachProfile(coach.userId),
    getCoachActiveClients(coach.supabase, coach.userId),
  ]);

  const coachName = coachProfile?.display_name ?? coach.displayName ?? t("Antrenor", "Coach");
  const plan = await getCoachMealPlanById(coach.supabase, coach.userId, id, coachName);

  if (!plan) notFound();

  return (
    <Screen
      back="/coach/meal-plans"
      title={plan.title}
    >
      <MealPlanBuilder
        initial={plan}
        coachName={coachName}
        clients={clients}
      />
    </Screen>
  );
}
