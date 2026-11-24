import Link from "next/link";
import { Globe, Plus, User, Utensils } from "lucide-react";
import { Text } from "@/app/components/language-provider";
import { getLanguage } from "@/app/language";
import { requireCoach } from "@/lib/coach/auth";
import {
  mealPlanGoalLabel,
  mealPlanStatusLabel,
  type MealPlanGoal,
  type MealPlanStatus,
} from "@/lib/coach/meal-plans";
import { Badge, Card, Columns, Empty, Screen, buttonClass } from "@/app/components/ui";

export const dynamic = "force-dynamic";

type MealPlanListRow = {
  id: string;
  assigned_client_id: string | null;
  title: string;
  description: string | null;
  goal: MealPlanGoal;
  status: MealPlanStatus;
  target_kcal: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
  share_token: string | null;
  updated_at: string;
  meal_plan_days: {
    id: string;
    meal_plan_meals: { id: string }[] | null;
  }[] | null;
};

const statusTone: Record<MealPlanStatus, "lime" | "gold" | undefined> = {
  active: "lime",
  draft: "gold",
  archived: undefined,
};

export default async function CoachMealPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { t } = await getLanguage();
  const coach = await requireCoach();
  const { filter: rawFilter } = await searchParams;
  const filter =
    rawFilter === "templates" ||
    rawFilter === "assigned" ||
    rawFilter === "active" ||
    rawFilter === "draft" ||
    rawFilter === "archived"
      ? rawFilter
      : "all";

  let query = coach.supabase
    .from("meal_plans")
    .select(
      "id, assigned_client_id, title, description, goal, status, target_kcal, target_protein_g, target_carbs_g, target_fat_g, share_token, updated_at, meal_plan_days(id, meal_plan_meals(id))",
    )
    .eq("coach_id", coach.userId)
    .order("updated_at", { ascending: false });

  if (filter === "templates") query = query.is("assigned_client_id", null);
  else if (filter === "assigned") query = query.not("assigned_client_id", "is", null);
  else if (filter !== "all") query = query.eq("status", filter);

  const { data, error } = await query;
  const plans = (data ?? []) as MealPlanListRow[];

  const clientIds = [...new Set(plans.map((p) => p.assigned_client_id).filter((id): id is string => Boolean(id)))];
  const clientNames = new Map<string, string>();
  if (clientIds.length > 0) {
    const { data: profilesData } = await coach.supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", clientIds);
    for (const p of profilesData ?? []) {
      const display = (p.display_name as string | null)?.trim();
      if (display) clientNames.set(p.id as string, display);
    }
  }

  const filterHref = (next: string) =>
    next === "all" ? "/coach/meal-plans" : `/coach/meal-plans?filter=${next}`;

  const filterOptions: { key: string; label: string }[] = [
    { key: "all", label: t("Toate", "All") },
    { key: "templates", label: t("Șabloane", "Templates") },
    { key: "assigned", label: t("Asignate clienților", "Assigned to clients") },
    { key: "active", label: mealPlanStatusLabel("active", t) },
    { key: "draft", label: mealPlanStatusLabel("draft", t) },
    { key: "archived", label: mealPlanStatusLabel("archived", t) },
  ];

  return (
    <Screen
      back="/coach"
      title={<Text ro="Planuri alimentare" en="Meal plans" />}
      right={
        <Link href="/coach/meal-plans/new" className={buttonClass({ small: true })}>
          <Plus className="size-4" />
          <Text ro="Plan nou" en="New plan" />
        </Link>
      }
    >
      <div className="flex flex-wrap gap-2">
        {filterOptions.map((item) => {
          const active = filter === item.key;
          return (
            <Link
              key={item.key}
              href={filterHref(item.key)}
              className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
                active ? "bg-lime text-on-solid" : "bg-card text-muted"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {error ? (
        <Card tone="red">
          <p className="text-sm font-semibold">{error.message}</p>
        </Card>
      ) : plans.length === 0 ? (
        <Empty icon={Utensils}>
          <Text
            ro="Nu ai încă planuri alimentare în această categorie."
            en="You have no meal plans in this category yet."
          />
        </Empty>
      ) : (
        <Columns>
          {plans.map((plan) => {
            const days = plan.meal_plan_days ?? [];
            const mealCount = days.reduce((sum, d) => sum + (d.meal_plan_meals?.length ?? 0), 0);
            const clientLabel = plan.assigned_client_id
              ? (clientNames.get(plan.assigned_client_id) ?? `${t("Client", "Client")} #${plan.assigned_client_id.slice(0, 6)}`)
              : null;

            return (
              <Card key={plan.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <h2 className="text-[20px] font-semibold tracking-[-0.4px]">{plan.title}</h2>
                    {plan.description && (
                      <p className="line-clamp-2 text-[13px] text-soft">{plan.description}</p>
                    )}
                  </div>
                  <Badge tone={statusTone[plan.status]}>
                    {mealPlanStatusLabel(plan.status, t)}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="ice">{mealPlanGoalLabel(plan.goal, t)}</Badge>
                  <Badge>
                    {days.length} {t(days.length === 1 ? "zi" : "zile", days.length === 1 ? "day" : "days")}
                  </Badge>
                  <Badge>
                    {mealCount} {t(mealCount === 1 ? "masă" : "mese", mealCount === 1 ? "meal" : "meals")}
                  </Badge>
                  {clientLabel ? (
                    <Badge tone="lilac" className="gap-1">
                      <User className="size-3" />
                      {clientLabel}
                    </Badge>
                  ) : (
                    <Badge tone="gold">
                      <Text ro="Șablon" en="Template" />
                    </Badge>
                  )}
                  {plan.share_token && (
                    <Badge tone="lime" className="gap-1">
                      <Globe className="size-3" />
                      <Text ro="Link public" en="Public link" />
                    </Badge>
                  )}
                </div>

                {(plan.target_kcal !== null || plan.target_protein_g !== null) && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-inner px-3 py-2 text-xs font-semibold tabular-nums">
                    {plan.target_kcal !== null && (
                      <span className="text-foreground">{plan.target_kcal} kcal</span>
                    )}
                    {plan.target_protein_g !== null && (
                      <span className="text-ice-text">P {plan.target_protein_g}g</span>
                    )}
                    {plan.target_carbs_g !== null && (
                      <span className="text-gold-text">C {plan.target_carbs_g}g</span>
                    )}
                    {plan.target_fat_g !== null && (
                      <span className="text-coral-text">{t("G", "F")} {plan.target_fat_g}g</span>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/coach/meal-plans/${plan.id}`}
                    className={buttonClass({ variant: "primary", small: true })}
                  >
                    <Text ro="Editează & Export PDF" en="Edit & Export PDF" />
                  </Link>
                  {plan.assigned_client_id && (
                    <Link
                      href={`/coach/clients/${plan.assigned_client_id}?tab=nutrition`}
                      className={buttonClass({ variant: "secondary", small: true })}
                    >
                      <Text ro="Fișa client" en="Client profile" />
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </Columns>
      )}
    </Screen>
  );
}
