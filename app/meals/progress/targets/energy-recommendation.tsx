"use client"

import { Text, useLanguage } from "@/app/components/language-provider"
import { useUnits } from "@/app/components/units-provider"
import { localDate } from "@/lib/daily-metrics"
import { ACTIVITY_LEVELS, recommendEnergy, WINDOW_DAYS, type ActivityLevel, type EnergyInput } from "@/lib/energy"
import { Calculator, Loader2, Sparkles } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { getEnergyData, saveEnergyGoal } from "./actions"

type Targets = { kcal: number; protein: number; carbs: number; fat: number; fiber: number }

const GOALS = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5]
const selectClass = "h-11 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 text-sm outline-none focus:border-orange-500"

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

  if (error) return <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>
  if (!input || !result) {
    return <div className="flex justify-center p-6"><Loader2 className="size-6 animate-spin text-orange-700 dark:text-orange-500" /></div>
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
    <section className="flex flex-col gap-4 p-5 rounded-3xl bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Calculator className="size-5 text-orange-700 dark:text-orange-500" />
        <Text ro="Recomandare automată" en="Automatic recommendation" />
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-500">
          <Text ro="Nivel de activitate" en="Activity level" />
          <select value={input.activityLevel ?? ""} onChange={(e) => void update((e.target.value || null) as ActivityLevel | null, goal)} className={selectClass}>
            <option value="" disabled>{t("Alege…", "Choose…")}</option>
            {(Object.keys(ACTIVITY_LEVELS) as ActivityLevel[]).map((level) => <option key={level} value={level}>{activityLabels[level]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-500">
          <Text ro="Obiectiv" en="Goal" />
          <select value={goal} onChange={(e) => void update(input.activityLevel, Number(e.target.value))} className={selectClass}>
            {GOALS.map((g) => <option key={g} value={g}>
              {g === 0 ? t("Menținere", "Maintain") : `${rate(g)} / ${t("săpt.", "week")}`}
            </option>)}
          </select>
        </label>
      </div>
      {saveError && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{saveError}</p>}

      {profileMissing.length > 0 && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t("Pentru estimarea din formulă completează în", "For the formula estimate, fill in")}{" "}
          <Link href="/settings" className="font-semibold text-orange-700 underline dark:text-orange-400">{t("Setări", "Settings")}</Link>:{" "}
          {profileMissing.map((m) => missingLabels[m]).join(", ")}.
        </p>
      )}
      {result.missing.includes("weight") && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t(`Nu ai nicio cântărire în ultimele ${WINDOW_DAYS} de zile. Adaug-o pe dashboard.`, `No weigh-in in the last ${WINDOW_DAYS} days. Add one on the dashboard.`)}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
        {[
          [t("Greutate", "Weight"), result.weightKg === null ? "—" : format(result.weightKg)],
          [t("Trend", "Trend"), trend === null ? "—" : `${rate(trend)}/${t("săpt.", "wk")}`],
          ["BMR", result.bmr === null ? "—" : kcal(result.bmr)],
          [t(`Mănânci (${result.loggedDays} zile)`, `Intake (${result.loggedDays} days)`), result.averageIntake === null ? "—" : kcal(result.averageIntake)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-white dark:bg-zinc-950/60 p-3 border border-zinc-200 dark:border-zinc-800">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</dt>
            <dd className="mt-1 font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      {result.tdee !== null && (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          {t("Consumul tău zilnic (TDEE)", "Your daily energy expenditure (TDEE)")}: <strong>{kcal(result.tdee)}</strong>{" "}
          {result.source === "adaptive"
            ? t(`— calculat din ce ai mâncat și cum s-a schimbat greutatea în ultimele ${WINDOW_DAYS} de zile.`, `— calculated from what you ate and how your weight changed over the last ${WINDOW_DAYS} days.`)
            : t("— estimat cu formula Mifflin-St Jeor. Devine mai exact după ~10 zile cu mesele înregistrate și câteva cântăriri.", "— estimated with the Mifflin-St Jeor formula. It gets more accurate after ~10 days of logged meals and a few weigh-ins.")}
        </p>
      )}

      {trendText && changeText && (
        <p className="flex gap-2 rounded-xl bg-orange-500/10 border border-orange-500/30 p-3 text-sm font-medium">
          <Sparkles className="size-4 shrink-0 mt-0.5 text-orange-700 dark:text-orange-400" />
          <span>{trendText}. {goalText}, {changeText}.</span>
        </p>
      )}

      {result.targets && (
        <div className="flex flex-col gap-3 rounded-2xl bg-white dark:bg-zinc-950/60 p-4 border border-orange-500/30">
          <p className="text-2xl font-black text-orange-700 dark:text-orange-400">{kcal(result.targets.kcal)}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            P {result.targets.protein} g · C {result.targets.carbs} g · {t("G", "F")} {result.targets.fat} g · {t("Fibre", "Fibre")} {result.targets.fiber} g
          </p>
          {result.floorApplied && (
            <p className="text-xs text-red-700 dark:text-red-400">
              {t("Am limitat targetul la un minim sigur. Pentru un ritm mai rapid discută cu un medic sau nutriționist.", "The target was raised to a safe minimum. For a faster rate, talk to a doctor or dietitian.")}
            </p>
          )}
          <button type="button" onClick={() => onApply(result.targets!)}
            className="h-11 rounded-xl bg-orange-500 px-4 text-sm font-bold text-zinc-950 hover:bg-orange-400 transition-all">
            <Text ro="Folosește aceste valori" en="Use these values" />
          </button>
          <p className="text-xs text-zinc-500">
            {t("Valorile se completează mai jos; apasă „Salvează Obiectivele” ca să le păstrezi.", "The values fill the form below; press “Save goals” to keep them.")}
          </p>
        </div>
      )}
    </section>
  )
}
