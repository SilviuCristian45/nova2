import Link from "next/link"
import { Utensils } from "lucide-react"
import { Text } from "@/app/components/language-provider"
import { getLanguage } from "@/app/language"
import { localDate } from "@/lib/daily-metrics"
import { createClient } from "@/lib/supabase/server"
import { getUserTargets } from "./action"
import { Badge, BigNumber, Card, Columns, CtaCard, Label, LinkList, ProgressBar, Screen, TextLink, buttonClass } from "@/app/components/ui"

export const dynamic = "force-dynamic"

// Nutrition hub: today's calories at a glance, active coach meal plan, one big way to log a meal and a plain list of the rest.
export default async function MealsHubPage() {
  const { t, locale } = await getLanguage()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let kcal = 0
  let mealCount = 0
  let goal = 0
  let activePlan: { id: string; title: string; target_kcal: number | null; coachName: string } | null = null
  if (user) {
    const [{ data: meals }, targets, { data: mealPlanRow }] = await Promise.all([
      supabase.from("meals").select("id, meal_items ( total_kcal )").eq("user_id", user.id).eq("performed_on", localDate()),
      getUserTargets(),
      supabase
        .from("meal_plans")
        .select("id, title, target_kcal, coach_id")
        .eq("assigned_client_id", user.id)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    for (const meal of meals ?? []) {
      for (const item of meal.meal_items ?? []) kcal += Number(item.total_kcal) || 0
    }
    kcal = Math.round(kcal)
    mealCount = meals?.length ?? 0
    goal = Number(targets.targets?.kcal) || 0

    if (mealPlanRow) {
      const { data: coachProf } = await supabase
        .from("coach_profiles")
        .select("display_name")
        .eq("user_id", mealPlanRow.coach_id)
        .maybeSingle()
      activePlan = {
        id: mealPlanRow.id as string,
        title: mealPlanRow.title as string,
        target_kcal: (mealPlanRow.target_kcal as number | null) ?? null,
        coachName: (coachProf?.display_name as string | null)?.trim() || t("Antrenor", "Coach"),
      }
    }
  }
  const over = goal > 0 && kcal > goal

  return (
    <Screen title={<Text ro="Nutriție" en="Nutrition" />}>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <Label>{t("Calorii azi", "Calories today")}</Label>
          <TextLink href="/meals/progress">{t("Detalii", "Details")}</TextLink>
        </div>
        <BigNumber value={kcal.toLocaleString(locale)} unit={goal ? `/ ${goal.toLocaleString(locale)} kcal` : "kcal"} />
        {goal > 0 && <ProgressBar value={(kcal / goal) * 100} tone={over ? "red" : "lime"} />}
        <p className="text-[13px] text-muted">
          {mealCount
            ? `${mealCount} ${t(mealCount === 1 ? "masă înregistrată" : "mese înregistrate", mealCount === 1 ? "meal logged" : "meals logged")}`
            : t("Nicio masă înregistrată azi", "No meals logged today")}
        </p>
      </Card>

      {activePlan && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-lime-text">
                <Utensils className="size-3.5" />
                <Text ro="Planul tău alimentar activ" en="Your active meal plan" />
              </span>
              <h2 className="text-[20px] font-semibold tracking-[-0.4px]">{activePlan.title}</h2>
              <p className="text-xs text-muted">
                {t("Antrenor", "Coach")}: {activePlan.coachName}
              </p>
            </div>
            {activePlan.target_kcal !== null && (
              <Badge tone="lime">{activePlan.target_kcal} kcal</Badge>
            )}
          </div>
          <Link href="/meals/plan" className={buttonClass({ small: true })}>
            <Utensils className="size-4" />
            <Text ro="Deschide planul & Export PDF" en="Open meal plan & Export PDF" />
          </Link>
        </Card>
      )}

      <Columns>
        <CtaCard href="/meals/insert" label={t("Masă nouă", "New meal")} title={t("Adaugă masă", "Add meal")} />
        <LinkList items={[
          { href: "/meals/plan", title: t("Plan alimentar", "Meal plan"), subtitle: t("Planul de la antrenor & export PDF", "Coach meal plan & PDF export") },
          { href: "/meals/history", title: t("Istoric mese", "Meal history"), subtitle: t("Jurnalul tău alimentar", "Your food diary") },
          { href: "/meals/progress", title: t("Statistici și macro", "Statistics and macros"), subtitle: t("Calorii, proteine, carbohidrați, grăsimi", "Calories, protein, carbs and fat") },
          { href: "/meals/progress/targets", title: t("Obiective", "Goals"), subtitle: t("Calorii și macronutrienți zilnici", "Daily calories and macros") },
        ]} />
      </Columns>
    </Screen>
  )
}
