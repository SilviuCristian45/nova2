import { Text } from "@/app/components/language-provider"
import { getLanguage } from "@/app/language"
import { localDate } from "@/lib/daily-metrics"
import { getCurrentAuthRole } from "@/lib/coach/auth"
import { pickNextProgramWorkout } from "@/lib/coach/programs"
import { mondayOfWeek } from "@/lib/coach/interactions"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Award, ChevronRight, ClipboardCheck, ClipboardList, Play, Settings, Utensils } from "lucide-react"
import { SignOutButton } from "./components/sign-out-button"
import { createClient } from "@/lib/supabase/server"
import { getDailySteps } from "./steps/steps"
import StepsInput from "./components/steps-input"
import WeightInput from "./components/weight-input"
import CheckinCard from "./components/checkin-card"
import { getDailyGoal } from "./profiles/profile"
import GoalSetting from "./components/goal-setting"
import { Badge, Card, Columns, CtaCard, LinkList, Screen, Stack, buttonClass, iconButtonClass } from "./components/ui"

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

  const today = localDate()
  const weekStart = mondayOfWeek(today)

  const [{ data: allWorkouts }, authRole, todaySteps, todayGoal, { data: activeEnrollmentRows }, { data: weeklyCheckinRow }, { data: activeMealPlanRow }] = await Promise.all([
    supabase.from("workouts").select("performed_on").eq("user_id", user.id),
    getCurrentAuthRole(),
    getDailySteps(today),
    getDailyGoal(),
    supabase
      .from("enrollments")
      .select("id, program_id, coach_id, current_week")
      .eq("client_id", user.id)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(5),
    supabase
      .from("weekly_checkins")
      .select("id, reviewed_at, coach_reply")
      .eq("client_id", user.id)
      .eq("week_start", weekStart)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("meal_plans")
      .select("id, title, target_kcal, target_protein_g, target_carbs_g, target_fat_g")
      .eq("assigned_client_id", user.id)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const streak = calculateWeeklyStreak(allWorkouts ?? [])
  const totalSessions = allWorkouts?.length ?? 0
  const name = authRole?.displayName?.trim()
  const isCoach = authRole?.role === "coach"

  const activeEnrollments = (activeEnrollmentRows ?? []) as { id: string; program_id: string | null; coach_id: string; current_week: number }[]
  const hasActiveCoach = activeEnrollments.length > 0

  type AssignedSummary = {
    enrollmentId: string
    programTitle: string
    coachName: string
    currentWeek: number
    nextWorkout: { id: string; title: string; week_number: number; day_number: number; workout_mode: string; itemCount: number } | null
    otherWorkouts: { id: string; title: string; week_number: number; day_number: number }[]
  }

  let assignedProgram: AssignedSummary | null = null
  const activeEnrollment = activeEnrollments.find((e) => e.program_id !== null)

  if (activeEnrollment?.program_id) {
    const [{ data: prog }, { data: coachProf }, { data: pWorkouts }, { data: doneWorkouts }] = await Promise.all([
      supabase.from("programs").select("id, title").eq("id", activeEnrollment.program_id).maybeSingle(),
      supabase.from("coach_profiles").select("display_name").eq("user_id", activeEnrollment.coach_id).maybeSingle(),
      supabase
        .from("program_workouts")
        .select("id, week_number, day_number, position, title, workout_mode, program_workout_exercises(id), program_workout_cardio(id)")
        .eq("program_id", activeEnrollment.program_id)
        .order("week_number", { ascending: true })
        .order("day_number", { ascending: true })
        .order("position", { ascending: true }),
      supabase
        .from("workouts")
        .select("program_workout_id")
        .eq("user_id", user.id)
        .eq("enrollment_id", activeEnrollment.id)
        .not("program_workout_id", "is", null),
    ])

    if (prog) {
      type PWRow = {
        id: string
        week_number: number
        day_number: number
        position: number
        title: string
        workout_mode: string
        program_workout_exercises: { id: string }[] | null
        program_workout_cardio: { id: string }[] | null
      }
      const typedWorkouts = (pWorkouts ?? []) as PWRow[]
      const completedSet = new Set((doneWorkouts ?? []).map((r) => r.program_workout_id as string))
      const picked = pickNextProgramWorkout(typedWorkouts, completedSet, activeEnrollment.current_week)

      assignedProgram = {
        enrollmentId: activeEnrollment.id,
        programTitle: prog.title as string,
        coachName: (coachProf?.display_name as string | undefined) ?? t("Antrenor", "Coach"),
        currentWeek: activeEnrollment.current_week,
        nextWorkout: picked
          ? {
              id: picked.id,
              title: picked.title,
              week_number: picked.week_number,
              day_number: picked.day_number,
              workout_mode: picked.workout_mode,
              itemCount:
                picked.workout_mode === "cardio"
                  ? (picked.program_workout_cardio?.length ?? 0)
                  : (picked.program_workout_exercises?.length ?? 0),
            }
          : null,
        otherWorkouts: typedWorkouts
          .filter((w) => w.id !== picked?.id)
          .slice(0, 6)
          .map((w) => ({ id: w.id, title: w.title, week_number: w.week_number, day_number: w.day_number })),
      }
    }
  }

  return (
    <Screen back={false}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted">
          {new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
        </span>
        <div className="flex items-center gap-2">
          {isCoach && (
            <Link href="/coach" className={buttonClass({ variant: "soft", tone: "lime", small: true })}>
              <Award className="size-4" />
              <Text ro="Antrenor" en="Coach" />
            </Link>
          )}
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

      <Columns>
        <Stack>
          <CtaCard href="/insert" label={t("Antrenament nou", "New workout")} title={t("Începe antrenamentul", "Start workout")} />
          {assignedProgram && (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-lime-text">
                    <ClipboardList className="size-3.5" />
                    <Text ro="Programul tău activ" en="Your active program" />
                  </span>
                  <h2 className="text-[20px] font-semibold tracking-[-0.4px]">{assignedProgram.programTitle}</h2>
                  <p className="text-xs text-muted">
                    {t("Antrenor", "Coach")}: {assignedProgram.coachName}
                  </p>
                </div>
                <Badge tone="lime">
                  {t("Săpt.", "Wk")} {assignedProgram.currentWeek}
                </Badge>
              </div>

              {assignedProgram.nextWorkout ? (
                <div className="flex flex-col gap-2.5 rounded-md bg-inner p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted">
                        <Text ro="Următorul antrenament recomandat" en="Next recommended workout" />
                      </p>
                      <p className="font-semibold">
                        {assignedProgram.nextWorkout.title}{" "}
                        <span className="text-xs font-normal text-muted">
                          ({t("S", "W")}{assignedProgram.nextWorkout.week_number}·{t("Z", "D")}{assignedProgram.nextWorkout.day_number} ·{" "}
                          {assignedProgram.nextWorkout.itemCount}{" "}
                          {assignedProgram.nextWorkout.workout_mode === "cardio"
                            ? t("activități", "activities")
                            : t("exerciții", "exercises")})
                        </span>
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/insert?programWorkoutId=${assignedProgram.nextWorkout.id}&enrollmentId=${assignedProgram.enrollmentId}`}
                    className={buttonClass({ small: true })}
                  >
                    <Play className="size-4" />
                    <Text ro="Pornește din program" en="Start program workout" />
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  <Text ro="Antrenorul nu a adăugat încă zile în acest program." en="Your coach hasn't added workout days to this program yet." />
                </p>
              )}

              {assignedProgram.otherWorkouts.length > 0 && (
                <details className="text-sm">
                  <summary className="text-xs font-semibold text-soft">
                    <Text ro="Alege altă zi din program" en="Choose another program day" />
                  </summary>
                  <div className="mt-2 flex flex-col gap-1">
                    {assignedProgram.otherWorkouts.map((day) => (
                      <Link
                        key={day.id}
                        href={`/insert?programWorkoutId=${day.id}&enrollmentId=${assignedProgram.enrollmentId}`}
                        className="flex items-center justify-between rounded-sm bg-inner px-3 py-2 text-xs font-medium transition-colors active:bg-control"
                      >
                        <span>
                          {t("S", "W")}{day.week_number}·{t("Z", "D")}{day.day_number} — {day.title}
                        </span>
                        <ChevronRight className="size-4 text-muted" />
                      </Link>
                    ))}
                  </div>
                </details>
              )}
            </Card>
          )}
          {activeMealPlanRow && (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-lime-text">
                    <Utensils className="size-3.5" />
                    <Text ro="Plan alimentar activ" en="Active meal plan" />
                  </span>
                  <h2 className="text-[18px] font-semibold tracking-[-0.3px]">
                    {activeMealPlanRow.title as string}
                  </h2>
                  {(activeMealPlanRow.target_kcal !== null || activeMealPlanRow.target_protein_g !== null) && (
                    <p className="text-xs text-muted tabular-nums">
                      {activeMealPlanRow.target_kcal !== null ? `${activeMealPlanRow.target_kcal} kcal` : ""}
                      {activeMealPlanRow.target_protein_g !== null ? ` · P ${activeMealPlanRow.target_protein_g}g` : ""}
                      {activeMealPlanRow.target_carbs_g !== null ? ` · C ${activeMealPlanRow.target_carbs_g}g` : ""}
                      {activeMealPlanRow.target_fat_g !== null ? ` · ${t("G", "F")} ${activeMealPlanRow.target_fat_g}g` : ""}
                    </p>
                  )}
                </div>
                {activeMealPlanRow.target_kcal !== null && (
                  <Badge tone="lime">{activeMealPlanRow.target_kcal as number} kcal</Badge>
                )}
              </div>
              <Link href="/meals/plan" className={buttonClass({ variant: "secondary", small: true })}>
                <Utensils className="size-4" />
                <Text ro="Vezi planul alimentar" en="View meal plan" />
              </Link>
            </Card>
          )}
          {hasActiveCoach && (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-lilac-text">
                    <ClipboardCheck className="size-3.5" />
                    <Text ro="Check-in săptămânal" en="Weekly check-in" />
                  </span>
                  <p className="text-sm font-semibold">
                    {weeklyCheckinRow?.reviewed_at
                      ? t("Antrenorul a răspuns la check-in!", "Your coach replied to your check-in!")
                      : weeklyCheckinRow
                        ? t("Trimis pe săptămâna aceasta", "Submitted for this week")
                        : t("Completează raportul pe săptămâna aceasta (1 min)", "Complete this week's check-in (1 min)")}
                  </p>
                </div>
                <Badge tone={weeklyCheckinRow?.reviewed_at ? "lime" : weeklyCheckinRow ? "gold" : "lilac"}>
                  {weeklyCheckinRow?.reviewed_at
                    ? t("Răspuns nou", "Reviewed")
                    : weeklyCheckinRow
                      ? t("Trimis", "Sent")
                      : t("De completat", "Due")}
                </Badge>
              </div>
              {weeklyCheckinRow?.coach_reply && (
                <p className="line-clamp-2 rounded-md border border-lime-border bg-lime-soft px-3 py-2 text-xs text-foreground">
                  {weeklyCheckinRow.coach_reply as string}
                </p>
              )}
              <Link href="/checkin/weekly" className={buttonClass({ variant: weeklyCheckinRow ? "secondary" : "primary", small: true })}>
                <ClipboardCheck className="size-4" />
                {weeklyCheckinRow?.reviewed_at
                  ? t("Vezi răspunsul", "View reply")
                  : weeklyCheckinRow
                    ? t("Vezi / Editează check-in", "View / Edit check-in")
                    : t("Completează check-in-ul", "Submit check-in")}
              </Link>
            </Card>
          )}
          <StepsInput initialSteps={todaySteps} date={today} goal={todayGoal} />
          <WeightInput />
          <CheckinCard />
        </Stack>
        <Stack>
          <LinkList items={[
            { href: "/explore", title: t("Programe & Antrenori", "Programs & Coaches"), subtitle: t("Descoperă programe sau introdu un cod", "Browse programs or join with a code") },
            { href: "/history", title: t("Antrenamente", "Workouts"), subtitle: t("Istoricul tău complet", "Your full history") },
            { href: "/stats", title: t("Progres", "Progress"), subtitle: t("Grafice și evoluție în timp", "Charts and trends over time") },
            { href: "/records", title: t("Recorduri personale", "Personal records"), subtitle: t("Cele mai bune performanțe", "Your all-time bests") },
            { href: "/photos", title: t("Poze de progres", "Progress photos"), subtitle: t("Înainte și după, în timp", "Before and after, over time") },
            { href: "/meals", title: t("Nutriție", "Nutrition"), subtitle: t("Jurnal alimentar și calorii", "Food diary and calories") },
          ]} />
          <GoalSetting currentGoal={todayGoal} />
        </Stack>
      </Columns>
    </Screen>
  )
}
