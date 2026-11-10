import { Text } from "@/app/components/language-provider"
import { getLanguage } from "@/app/language"
import { localDate } from "@/lib/daily-metrics"
import { createClient } from "@/lib/supabase/server"
import { getUserTargets } from "./action"
import { BigNumber, Card, Columns, CtaCard, Label, LinkList, ProgressBar, Screen, TextLink } from "@/app/components/ui"

export const dynamic = "force-dynamic"

// Nutrition hub: today's calories at a glance, one big way to log a meal and a plain list of the rest.
export default async function MealsHubPage() {
  const { t, locale } = await getLanguage()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let kcal = 0
  let mealCount = 0
  let goal = 0
  if (user) {
    const [{ data: meals }, targets] = await Promise.all([
      supabase.from("meals").select("id, meal_items ( total_kcal )").eq("user_id", user.id).eq("performed_on", localDate()),
      getUserTargets(),
    ])
    for (const meal of meals ?? []) {
      for (const item of meal.meal_items ?? []) kcal += Number(item.total_kcal) || 0
    }
    kcal = Math.round(kcal)
    mealCount = meals?.length ?? 0
    goal = Number(targets.targets?.kcal) || 0
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

      <Columns>
        <CtaCard href="/meals/insert" label={t("Masă nouă", "New meal")} title={t("Adaugă masă", "Add meal")} />
        <LinkList items={[
          { href: "/meals/history", title: t("Istoric mese", "Meal history"), subtitle: t("Jurnalul tău alimentar", "Your food diary") },
          { href: "/meals/progress", title: t("Statistici și macro", "Statistics and macros"), subtitle: t("Calorii, proteine, carbohidrați, grăsimi", "Calories, protein, carbs and fat") },
          { href: "/meals/progress/targets", title: t("Obiective", "Goals"), subtitle: t("Calorii și macronutrienți zilnici", "Daily calories and macros") },
        ]} />
      </Columns>
    </Screen>
  )
}
