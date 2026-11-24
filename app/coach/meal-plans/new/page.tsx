import { Text } from "@/app/components/language-provider";
import { getLanguage } from "@/app/language";
import { getOwnCoachProfile, requireCoach } from "@/lib/coach/auth";
import { Screen } from "@/app/components/ui";
import { getCoachActiveClients } from "../data";
import { MealPlanBuilder } from "../meal-plan-builder";

export const dynamic = "force-dynamic";

export default async function NewMealPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { t } = await getLanguage();
  const coach = await requireCoach();
  const { clientId } = await searchParams;

  const [coachProfile, clients] = await Promise.all([
    getOwnCoachProfile(coach.userId),
    getCoachActiveClients(coach.supabase, coach.userId),
  ]);

  const coachName = coachProfile?.display_name ?? coach.displayName ?? t("Antrenor", "Coach");
  const validClientId = clientId && clients.some((c) => c.id === clientId) ? clientId : null;

  return (
    <Screen
      back={validClientId ? `/coach/clients/${validClientId}?tab=nutrition` : "/coach/meal-plans"}
      title={<Text ro="Plan alimentar nou" en="New meal plan" />}
    >
      <MealPlanBuilder
        initial={null}
        coachName={coachName}
        clients={clients}
        preselectedClientId={validClientId}
      />
    </Screen>
  );
}
