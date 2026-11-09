"use client"

import { Text, useLanguage } from "@/app/components/language-provider"
import { useUnits } from "@/app/components/units-provider"
import { localDate } from "@/lib/daily-metrics"
import { ACTIVITY_LEVELS, recommendEnergy, WINDOW_DAYS, type ActivityLevel, type EnergyInput } from "@/lib/energy"
import { Loader2, Sparkles } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { getEnergyData, saveEnergyGoal } from "./actions"
import { Button, Card, CardTitle, Field, Message, Select } from "@/app/components/ui"

type Targets = { kcal: number; protein: number; carbs: number; fat: number; fiber: number }

const GOALS = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5]

export function EnergyRecommendation({ onApply }: { onApply: (targets: Targets) => void }) {
  const { t, locale } = useLanguage()
  const { format } = useUnits()
  const [today] = useState(() => localDate())
  const [input, setInput] = useState<Omit<EnergyInput, "today"> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void getEnergyData(today).then((res) => {
      if (cancelled) return
      if (res.error) setError(res.error)
      else setInput(res.input ?? null)
    })
    return () => { cancelled = true }
  }, [today])

  const result = useMemo(() => input && recommendEnergy({ ...input, today }), [input, today])

  async function update(activityLevel: ActivityLevel | null, goalKgPerWeek: number) {
    if (!input) return
    setInput({ ...input, activityLevel, goalKgPerWeek })
    setSaveError(null)
    if (!activityLevel) return
    const res = await saveEnergyGoal(activityLevel, goalKgPerWeek)
    if (res.error) setSaveError(res.error)
  }

  if (error) return <Message>{error}</Message>
  if (!input || !result) {
    return <div className="flex justify-center p-6"><Loader2 className="size-6 animate-spin text-lime-text" /></div>
  }

  const kcal = (n: number) => `${n.toLocaleString(locale)} kcal`
  const rate = (kg: number) => `${kg > 0 ? "+" : kg < 0 ? "−" : ""}${format(Math.abs(kg))}`
  const activityLabels: Record<ActivityLevel, string> = {
    sedentary: t("Sedentar (birou, fără sport)", "Sedentary (desk job, no exercise)"),
    light: t("Ușor activ (1–3 antrenamente/săpt.)", "Lightly active (1–3 workouts/week)"),
    moderate: t("Moderat activ (3–5 antrenamente/săpt.)", "Moderately active (3–5 workouts/week)"),
    active: t("Foarte activ (6–7 antrenamente/săpt.)", "Very active (6–7 workouts/week)"),
    very_active: t("Extrem de activ (muncă fizică + sport)", "Extremely active (physical job + training)"),
  }
  const missingLabels = {
    sex: t("sexul", "sex"), height: t("înălțimea", "height"), birthDate: t("data nașterii", "birth date"),
    activity: t("nivelul de activitate", "activity level"), weight: t("o cântărire recentă", "a recent weigh-in"),
  }
  const profileMissing = result.missing.filter((m) => m !== "activity" && m !== "weight")

  const trend = result.trendKgPerWeek
  const trendText = trend === null ? null
    : Math.abs(trend) < 0.05 ? t("Greutatea ta e stabilă", "Your weight is stable")
    : trend < 0 ? t(`Slăbești ${format(-trend)}/săpt.`, `You are losing ${format(-trend)}/week`)
    : t(`Iei ${format(trend)}/săpt.`, `You are gaining ${format(trend)}/week`)
  const goal = input.goalKgPerWeek
  const goalText = goal < 0 ? t(`Ca să slăbești ${format(-goal)}/săpt.`, `To lose ${format(-goal)}/week`)
    : goal > 0 ? t(`Ca să iei ${format(goal)}/săpt.`, `To gain ${format(goal)}/week`)
    : t("Ca să-ți menții greutatea", "To maintain your weight")
  const change = result.intakeChange
  const changeText = change === null ? null
    : Math.abs(change) < 50 ? t("continuă să mănânci la fel", "keep eating the same")
    : change < 0 ? t(`mănâncă cu ~${kcal(-change)} mai puțin pe zi`, `eat ~${kcal(-change)} less per day`)
    : t(`mănâncă cu ~${kcal(change)} mai mult pe zi`, `eat ~${kcal(change)} more per day`)

  return (
    <Card>
      <CardTitle><Text ro="Recomandare automată" en="Automatic recommendation" /></CardTitle>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={<Text ro="Nivel de activitate" en="Activity level" />}>
          <Select title={t("Nivel de activitate", "Activity level")} placeholder={t("Alege…", "Choose…")} value={input.activityLevel ?? ""}
            onChange={(value) => void update((value || null) as ActivityLevel | null, goal)}
            options={(Object.keys(ACTIVITY_LEVELS) as ActivityLevel[]).map((level) => ({ value: level, label: activityLabels[level] }))} />
        </Field>
        <Field label={<Text ro="Obiectiv" en="Goal" />}>
          <Select title={t("Obiectiv", "Goal")} value={String(goal)}
            onChange={(value) => void update(input.activityLevel, Number(value))}
            options={GOALS.map((g) => ({ value: String(g), label: g === 0 ? t("Menținere", "Maintain") : `${rate(g)} / ${t("săpt.", "week")}` }))} />
        </Field>
      </div>
      {saveError && <Message>{saveError}</Message>}

      {profileMissing.length > 0 && (
        <p className="text-[13px] text-soft">
          {t("Pentru estimarea din formulă completează în", "For the formula estimate, fill in")}{" "}
          <Link href="/settings" className="font-semibold text-lime-text underline">{t("Setări", "Settings")}</Link>:{" "}
          {profileMissing.map((m) => missingLabels[m]).join(", ")}.
        </p>
      )}
      {result.missing.includes("weight") && (
        <p className="text-[13px] text-soft">
          {t(`Nu ai nicio cântărire în ultimele ${WINDOW_DAYS} de zile. Adaug-o pe dashboard.`, `No weigh-in in the last ${WINDOW_DAYS} days. Add one on the dashboard.`)}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {[
          [t("Greutate", "Weight"), result.weightKg === null ? "—" : format(result.weightKg)],
          [t("Trend", "Trend"), trend === null ? "—" : `${rate(trend)}/${t("săpt.", "wk")}`],
          ["BMR", result.bmr === null ? "—" : kcal(result.bmr)],
          [t(`Mănânci (${result.loggedDays} zile)`, `Intake (${result.loggedDays} days)`), result.averageIntake === null ? "—" : kcal(result.averageIntake)],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1 rounded-md bg-inner p-3">
            <dt className="text-xs font-medium text-muted">{label}</dt>
            <dd className="font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {result.tdee !== null && (
        <p className="text-sm text-soft">
          {t("Consumul tău zilnic (TDEE)", "Your daily energy expenditure (TDEE)")}: <strong>{kcal(result.tdee)}</strong>{" "}
          {result.source === "adaptive"
            ? t(`— calculat din ce ai mâncat și cum s-a schimbat greutatea în ultimele ${WINDOW_DAYS} de zile.`, `— calculated from what you ate and how your weight changed over the last ${WINDOW_DAYS} days.`)
            : t("— estimat cu formula Mifflin-St Jeor. Devine mai exact după ~10 zile cu mesele înregistrate și câteva cântăriri.", "— estimated with the Mifflin-St Jeor formula. It gets more accurate after ~10 days of logged meals and a few weigh-ins.")}
        </p>
      )}

      {trendText && changeText && (
        <p className="flex gap-2 rounded-md bg-lime-soft p-3.5 text-sm font-semibold text-lime-text">
          <Sparkles className="mt-0.5 size-4 shrink-0" />
          <span>{trendText}. {goalText}, {changeText}.</span>
        </p>
      )}

      {result.targets && (
        <div className="flex flex-col gap-3 rounded-md bg-inner p-3.5">
          <p className="text-[32px] font-bold leading-none tracking-[-1px] tabular-nums">{kcal(result.targets.kcal)}</p>
          <p className="text-[13px] text-soft">
            P {result.targets.protein} g · C {result.targets.carbs} g · {t("G", "F")} {result.targets.fat} g · {t("Fibre", "Fibre")} {result.targets.fiber} g
          </p>
          {result.floorApplied && (
            <p className="text-xs font-semibold text-red-text">
              {t("Am limitat targetul la un minim sigur. Pentru un ritm mai rapid discută cu un medic sau nutriționist.", "The target was raised to a safe minimum. For a faster rate, talk to a doctor or dietitian.")}
            </p>
          )}
          <Button onClick={() => onApply(result.targets!)}>
            <Text ro="Folosește aceste valori" en="Use these values" />
          </Button>
          <p className="text-xs text-muted">
            {t("Valorile se completează mai jos; apasă „Salvează obiectivele” ca să le păstrezi.", "The values fill the form below; press “Save goals” to keep them.")}
          </p>
        </div>
      )}
    </Card>
  )
}
