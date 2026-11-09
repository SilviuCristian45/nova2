import { Text } from "@/app/components/language-provider"
import { getLanguage } from "@/app/language"
import { localDate } from "@/lib/daily-metrics"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Settings } from "lucide-react"
import { SignOutButton } from "./components/sign-out-button"
import { createClient } from "@/lib/supabase/server"
import { getDailySteps } from "./steps/steps"
import StepsInput from "./components/steps-input"
import WeightInput from "./components/weight-input"
import { getDailyGoal } from "./profiles/profile"
import GoalSetting from "./components/goal-setting"
import { CtaCard, LinkList, Screen, buttonClass, iconButtonClass } from "./components/ui"

export const dynamic = "force-dynamic"
export const revalidate = 0

function calculateWeeklyStreak(workouts: { performed_on: string }[]) {
  const monday = (date: Date) => {
    const copy = new Date(date);
    copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
    return copy.setHours(0, 0, 0, 0);
  };
  const activeWeeks = new Set(workouts.map((workout) => monday(new Date(`${workout.performed_on}T00:00:00`))));
  const date = new Date();
  if (!activeWeeks.has(monday(date))) date.setDate(date.getDate() - 7);
  let streak = 0;
  while (activeWeeks.has(monday(date))) {
    streak++;
    date.setDate(date.getDate() - 7);
  }
  return streak;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  // The workout list used to live here as "/?history=true"; keep old links working.
  const params = await searchParams
  if (params.history === "true" || params.page || params.startDate) {
    const query = new URLSearchParams()
    for (const key of ["startDate", "endDate", "page"]) if (params[key]) query.set(key, params[key]!)
    redirect(`/history${query.size ? `?${query}` : ""}`)
  }

  const { t, locale } = await getLanguage()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <Screen back={false} className="min-h-dvh justify-center text-center">
        <h1 className="text-[28px] font-bold tracking-[-0.8px]"><Text ro="Sesiune expirată" en="Session expired" /></h1>
        <p className="text-muted"><Text ro="Trebuie să te loghezi din nou pentru a continua." en="Please sign in again to continue." /></p>
        <Link href="/login" className={buttonClass()}><Text ro="Mergi la login" en="Go to sign in" /></Link>
      </Screen>
    )
  }

  const [{ data: allWorkouts }, { data: profile }, todaySteps, todayGoal] = await Promise.all([
    supabase.from("workouts").select("performed_on").eq("user_id", user.id),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    getDailySteps(localDate()),
    getDailyGoal(),
  ])
  const streak = calculateWeeklyStreak(allWorkouts ?? [])
  const totalSessions = allWorkouts?.length ?? 0
  const name = (profile?.display_name as string | null | undefined)?.trim()

  return (
    <Screen back={false}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted">
          {new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
        </span>
        <div className="flex items-center gap-2">
          <Link href="/settings" aria-label={t("Setări", "Settings")} title={t("Setări", "Settings")} className={iconButtonClass()}>
            <Settings className="size-5" />
          </Link>
          <SignOutButton />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h1 className="text-[36px] font-bold leading-[40px] tracking-[-1.4px]">
          {name ? `${t("Salut", "Hi")}, ${name}` : t("Gata de antrenament?", "Ready to train?")}
        </h1>
        <p className="text-muted">
          <span className="font-semibold text-foreground tabular-nums">{totalSessions}</span> {t("antrenamente", "workouts")}
          {streak > 0 && <> · <span className="font-semibold text-foreground tabular-nums">{streak}</span> {t("săpt. la rând", "week streak")}</>}
        </p>
      </div>

      <CtaCard href="/insert" label={t("Antrenament nou", "New workout")} title={t("Începe antrenamentul", "Start workout")} />

      <StepsInput initialSteps={todaySteps} date={localDate()} goal={todayGoal} />
      <WeightInput />

      <LinkList items={[
        { href: "/history", title: t("Antrenamente", "Workouts"), subtitle: t("Istoricul tău complet", "Your full history") },
        { href: "/stats", title: t("Progres", "Progress"), subtitle: t("Grafice și evoluție în timp", "Charts and trends over time") },
        { href: "/records", title: t("Recorduri personale", "Personal records"), subtitle: t("Cele mai bune performanțe", "Your all-time bests") },
        { href: "/meals", title: t("Nutriție", "Nutrition"), subtitle: t("Jurnal alimentar și calorii", "Food diary and calories") },
      ]} />

      <GoalSetting currentGoal={todayGoal} />
    </Screen>
  )
}
