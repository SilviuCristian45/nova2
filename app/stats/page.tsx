"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BarChart3, Search, Activity, Footprints, Download, Scale } from "lucide-react";
import {
  ComposedChart, Scatter, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { EXERCISES, CARDIO_ACTIVITIES } from "@/lib/workout-data";
import { createClient } from "@/utils/supabase/client";
import {
  getStrengthProgression, strengthProgressionCsv, withBodyWeights, type StrengthWorkout,
} from "@/lib/strength-progression";
import { chartMode, localDate, measurementPoints } from "@/lib/daily-metrics";
import { useUnits } from "@/app/components/units-provider";
import { useLanguage } from "@/app/components/language-provider";
import { cardioName, exerciseName as localizedExercise, matchesExerciseQuery } from "@/lib/exercise-catalog";
import { ExerciseName } from "@/app/components/exercise-name";

type Workout = StrengthWorkout & {
  cardio_sessions: { activity: string; duration_min: number | null }[] | null;
};
type Measurement = { date: string; value: number };
type ChartPoint = {
  date: string;
  weight?: number;
  reps?: number;
  bodyWeight?: number | null;
  duration?: number;
  value?: number;
  target?: number;
};
const PAGE_SIZE = 1000;
const surface = "border border-zinc-200 dark:border-zinc-800/80 rounded-3xl bg-white dark:bg-zinc-900/40 shadow-sm";
const field = "h-12 w-full px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-sm outline-none focus:border-cyan-600";
const tooltipStyle = {
  backgroundColor: "var(--card)",
  borderColor: "var(--secondary)",
  color: "var(--foreground)",
  borderRadius: "12px",
  padding: "12px 16px",
};

export default function StatsPage() {
  return <Suspense><StatsContent /></Suspense>;
}

function StatsContent() {
  const { t, locale, language } = useLanguage();
  const { unit, toUnit } = useUnits();
  const router = useRouter();
  const params = useSearchParams();
  const mode = chartMode(params.get("mode"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const [workoutData, setWorkoutData] = useState<Workout[]>([]);
  const [bodyWeights, setBodyWeights] = useState<{ date: string; weight_kg: number }[]>([]);
  const [bodyWeightError, setBodyWeightError] = useState<string | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [stepsGoal, setStepsGoal] = useState(10000);
  const [selectedExercise, setSelectedExercise] = useState<string>(EXERCISES[0]);
  const [selectedCardio, setSelectedCardio] = useState<string>(CARDIO_ACTIVITIES[0]);
  const [timeRange, setTimeRange] = useState(30);
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [isExerciseOpen, setIsExerciseOpen] = useState(false);
  const requestKey = `${mode}:${timeRange}:${retry}`;
  const isLoading = loading || loadedKey !== requestKey;

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setError(null);
      setWorkoutData([]);
      setBodyWeights([]);
      setBodyWeightError(null);
      setMeasurements([]);
      try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("unauthorized");
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - timeRange);
        const cutoffStr = timeRange === 7300 ? "0001-01-01" : localDate(cutoff);
        const endDate = localDate();

        if (mode === "strength" || mode === "cardio") {
          const rows: Workout[] = [];
          for (let from = 0; ; from += PAGE_SIZE) {
            const { data, error } = await supabase.from("workouts")
              .select("performed_on, workout_mode, workout_sets (*), cardio_sessions (*)")
              .eq("user_id", user.id).eq("workout_mode", mode)
              .gte("performed_on", cutoffStr).lte("performed_on", endDate)
              .order("performed_on").order("id").range(from, from + PAGE_SIZE - 1);
            if (error) throw new Error(error.message);
            rows.push(...(data ?? []));
            if (cancelled) return;
            if (!data || data.length < PAGE_SIZE) break;
          }
          setWorkoutData(rows);
          if (mode === "strength") {
            try {
              const weights: { date: string; weight_kg: number }[] = [];
              for (let from = 0; ; from += PAGE_SIZE) {
                const { data, error } = await supabase.from("daily_weight")
                  .select("date, weight_kg").eq("user_id", user.id)
                  .gte("date", cutoffStr).lte("date", endDate).order("date")
                  .range(from, from + PAGE_SIZE - 1);
                if (error) throw new Error(error.message);
                weights.push(...(data ?? []).map((entry) => ({
                  date: entry.date, weight_kg: Number(entry.weight_kg),
                })));
                if (cancelled) return;
                if (!data || data.length < PAGE_SIZE) break;
              }
              setBodyWeights(weights);
            } catch (error) {
              if (!cancelled) setBodyWeightError(error instanceof Error ? error.message : "load-failed");
            }
          }
        } else {
          const rows: Measurement[] = [];
          for (let from = 0; ; from += PAGE_SIZE) {
            const query = mode === "steps"
              ? supabase.from("daily_steps").select("date, steps")
              : supabase.from("daily_weight").select("date, weight_kg");
            const { data, error } = await query.eq("user_id", user.id)
              .gte("date", cutoffStr).lte("date", endDate).order("date")
              .range(from, from + PAGE_SIZE - 1);
            if (error) {
              if (mode === "weight" && (error.code === "PGRST205" || error.code === "42P01")) throw new Error("weight-setup");
              throw new Error(error.message);
            }
            for (const row of data ?? []) {
              rows.push({
                date: row.date,
                value: Number("steps" in row ? row.steps : row.weight_kg),
              });
            }
            if (cancelled) return;
            if (!data || data.length < PAGE_SIZE) break;
          }
          if (mode === "steps") {
            const { data, error } = await supabase.from("profiles")
              .select("daily_steps_goal").eq("id", user.id).maybeSingle();
            if (error) throw new Error(error.message);
            if (cancelled) return;
            setStepsGoal(data?.daily_steps_goal || 10000);
          }
          setMeasurements(rows);
        }
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : "load-failed");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadedKey(`${mode}:${timeRange}:${retry}`);
        }
      }
    }
    void fetchData();
    return () => { cancelled = true; };
  }, [timeRange, retry, mode]);

  // Charts and CSV show the user's unit; the data stays in kg until this point.
  const strengthData = withBodyWeights(
    getStrengthProgression(workoutData, selectedExercise, locale), bodyWeights,
  ).map((point) => ({
    ...point, weight: toUnit(point.weight), bodyWeight: point.bodyWeight == null ? point.bodyWeight : toUnit(point.bodyWeight),
  }));
  const hasBodyWeights = strengthData.some((point) => point.bodyWeight != null);
  const chartData: ChartPoint[] = mode === "strength" ? strengthData : mode === "cardio"
    ? workoutData.flatMap((workout) => {
      const sessions = workout.cardio_sessions?.filter((session) => session.activity === selectedCardio);
      return sessions?.length ? [{
        date: new Date(`${workout.performed_on}T00:00:00`).toLocaleDateString(locale, { month: "short", day: "numeric" }),
        duration: sessions.reduce((sum, session) => sum + Number(session.duration_min || 0), 0),
      }] : [];
    })
    : measurementPoints(measurements, locale).map((day) => ({
      date: day.label,
      value: mode === "weight" ? toUnit(day.value) : day.value,
      ...(mode === "steps" ? { target: stepsGoal } : {}),
    }));

  function exportCsv() {
    try {
      const url = URL.createObjectURL(new Blob(
        [strengthProgressionCsv(strengthData, selectedExercise, unit)],
        { type: "text/csv;charset=utf-8;" },
      ));
      const link = document.createElement("a");
      link.href = url;
      const exerciseName = selectedExercise.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
      link.download = `strength-${exerciseName}-${timeRange === 7300 ? "all" : `${timeRange}d`}.csv`;
      document.body.appendChild(link);
      try {
        link.click();
      } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      setError("export-failed");
    }
  }

  const errorMessage = error === "unauthorized"
    ? t("Sesiune expirată. Autentifică-te din nou.", "Session expired. Please sign in again.")
    : error === "weight-setup"
      ? t("Urmărirea greutății necesită migrarea bazei de date. Consultă README.", "Weight tracking requires the database migration. See README.")
      : error === "export-failed"
        ? t("Exportul CSV a eșuat. Încearcă din nou.", "CSV export failed. Please retry.")
        : t("Nu am putut încărca datele graficului.", "Unable to load chart data.") + (error && error !== "load-failed" ? ` (${error})` : "");
  const exercises = EXERCISES.filter((exercise) => matchesExerciseQuery(exercise, exerciseQuery));
  const measurementMode = mode === "steps" || mode === "weight";
  const chartTitle = mode === "strength" ? localizedExercise(selectedExercise, language) : mode === "cardio" ? cardioName(selectedCardio, language)
    : mode === "steps" ? t("Pași zilnici", "Daily steps") : t(`Greutate corporală (${unit})`, `Body weight (${unit})`);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col p-5 sm:p-8 bg-background text-foreground">
      <header className="flex items-center gap-3 mb-6">
        <Link href="/" aria-label={t("Înapoi", "Back")} className="p-2.5 -ml-2 text-muted-foreground hover:bg-secondary rounded-xl">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t("Progresie și grafice", "Progress & Charts")}</h1>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1.5 border border-secondary rounded-2xl bg-card mb-6 lg:max-w-2xl">
        {([
          ["strength", t("Forță", "Strength"), BarChart3],
          ["cardio", t("Cardio", "Cardio"), Activity],
          ["steps", t("Pași", "Steps"), Footprints],
          ["weight", t("Greutate", "Weight"), Scale],
        ] as const).map(([value, label, Icon]) => (
          <button key={value} type="button"
            onClick={() => router.replace(`/stats?mode=${value}`, { scroll: false })}
            aria-pressed={mode === value}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors ${mode === value ? "bg-secondary text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      {error && !isLoading && (
        <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-700 dark:text-red-400">
          <p>{errorMessage}</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)} className="rounded-lg border border-current px-3 py-1.5 text-sm font-bold">{t("Reîncearcă", "Retry")}</button>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <section aria-label={t("Filtre grafic", "Chart filters")} className={`${surface} flex flex-col gap-5 p-5 relative z-20`}>
          {!measurementMode && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tracked-exercise" className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                {mode === "strength" ? t("Exercițiu urmărit", "Tracked exercise") : t("Activitate cardio", "Cardio activity")}
              </label>
              {mode === "strength" ? (
                <div className="relative">
                  <input id="tracked-exercise" type="text"
                    value={isExerciseOpen ? exerciseQuery : localizedExercise(selectedExercise, language)}
                    onChange={(event) => { setExerciseQuery(event.target.value); setIsExerciseOpen(true); }}
                    onFocus={() => { setExerciseQuery(""); setIsExerciseOpen(true); }}
                    onBlur={() => setTimeout(() => setIsExerciseOpen(false), 150)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setIsExerciseOpen(false);
                      if (event.key === "Enter" && exercises.length) {
                        setSelectedExercise(exercises[0]); setIsExerciseOpen(false);
                      }
                    }}
                    placeholder={t("Caută exercițiul...", "Search exercises...")}
                    className={`${field} pr-10 text-cyan-700 dark:text-cyan-400 font-semibold`} />
                  <Search className="absolute right-4 top-3.5 size-4 text-muted-foreground pointer-events-none" />
                  {isExerciseOpen && (
                    <ul className="absolute z-30 top-[52px] left-0 right-0 max-h-60 overflow-y-auto rounded-xl border border-secondary bg-card p-1.5 shadow-xl">
                      {exercises.length ? exercises.map((exercise) => (
                        <li key={exercise}>
                          <button type="button" onMouseDown={(event) => event.preventDefault()}
                            onClick={() => { setSelectedExercise(exercise); setIsExerciseOpen(false); }}
                            className={`w-full text-left rounded-lg px-3 py-2.5 text-sm ${selectedExercise === exercise ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 font-bold" : "hover:bg-secondary"}`}>
                            <ExerciseName id={exercise} />
                          </button>
                        </li>
                      )) : <li className="p-3 text-sm text-muted-foreground">{t("Nu am găsit acest exercițiu.", "No matching exercise.")}</li>}
                    </ul>
                  )}
                </div>
              ) : (
                <select id="tracked-exercise" value={selectedCardio} onChange={(event) => setSelectedCardio(event.target.value)} className={field}>
                  {CARDIO_ACTIVITIES.map((activity) => <option key={activity} value={activity}>{cardioName(activity, language)}</option>)}
                </select>
              )}
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">{t("Perioadă analizată", "Time period")}</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: t("7Z", "7D"), days: 7 }, { label: t("1L", "1M"), days: 30 },
                { label: t("1A", "1Y"), days: 365 }, { label: t("TOT", "ALL"), days: 7300 },
              ].map((range) => (
                <button key={range.days} type="button" onClick={() => setTimeRange(range.days)} aria-pressed={timeRange === range.days}
                  className={`py-2.5 rounded-xl text-xs font-bold border border-secondary ${timeRange === range.days ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-950" : "bg-background text-muted-foreground hover:bg-secondary"}`}>
                  {range.label}
                </button>
              ))}
            </div>
          </div>
          {measurementMode && (
            <p className="text-sm text-muted-foreground">
              {mode === "steps"
                ? t("Pașii înregistrați zilnic și obiectivul tău curent.", "Your recorded daily steps and current goal.")
                : t(`Cântăririle tale în ${unit}. Zilele fără înregistrări nu sunt considerate zero.`, `Your weigh-ins in ${unit}. Days without an entry are not counted as zero.`)}
            </p>
          )}
        </section>

        <section aria-label={t("Grafic evoluție", "Progress chart")} className={`${surface} min-w-0 p-4 sm:p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h2 className="font-bold">{chartTitle}</h2>
            {mode === "strength" && (
              <button type="button" onClick={exportCsv} disabled={isLoading || !strengthData.length}
                className="flex items-center gap-2 rounded-xl border border-secondary bg-background px-4 py-2.5 text-sm font-bold hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed">
                <Download className="size-4" />{t("Exportă CSV", "Export CSV")}
              </button>
            )}
          </div>
          {isLoading ? (
            <p role="status" className="flex min-h-[300px] items-center justify-center text-muted-foreground">{t("Analizăm datele...", "Loading chart data...")}</p>
          ) : chartData.length === 0 || (error && error !== "export-failed") ? (
            <div className="flex min-h-[300px] flex-col gap-3 items-center justify-center text-center text-muted-foreground">
              <p>{error
                ? t("Graficul nu este disponibil. Reîncearcă încărcarea datelor.", "Chart unavailable. Please retry loading.")
                : t("Nu există înregistrări în această perioadă.", "No entries in this period.")}</p>
              {measurementMode && !error && <Link href="/" className="font-bold text-primary">{t("Adaugă o înregistrare", "Add an entry")}</Link>}
            </div>
          ) : (
            <div className="h-[300px] sm:h-[420px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                {measurementMode ? (
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: "var(--chart-axis)" }} dy={10} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} tick={{ fill: "var(--chart-axis)" }}
                      allowDecimals={mode === "weight"}
                      domain={mode === "steps" ? [0, (max: number) => Math.max(max, stepsGoal) + 2000] : ["auto", "auto"]}
                      unit={mode === "weight" ? ` ${unit}` : undefined} />
                    <Tooltip
                      cursor={{ stroke: "var(--chart-axis)", strokeDasharray: "6 6" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const point = payload[0].payload as ChartPoint;
                        const value = point.value ?? 0;
                        return (
                          <div style={tooltipStyle} className="border shadow-xl text-sm font-bold">
                            <p className="text-xs text-muted-foreground mb-1">{point.date}</p>
                            <p className="text-cyan-700 dark:text-cyan-400">{mode === "steps" ? t("Pași", "Steps") : t("Greutate", "Weight")}: {value.toLocaleString(locale)}{mode === "weight" ? ` ${unit}` : ""}</p>
                            {mode === "steps" && <>
                              <p className="text-muted-foreground">{t("Obiectiv", "Goal")}: {stepsGoal.toLocaleString(locale)}</p>
                              <p className={value >= stepsGoal ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}>
                                {value >= stepsGoal ? t("OBIECTIV ATINS", "GOAL REACHED") : `${(stepsGoal - value).toLocaleString(locale)} ${t("pași rămași", "steps remaining")}`}
                              </p>
                            </>}
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ paddingTop: 25, fontSize: 12 }} iconType="circle" />
                    {mode === "steps" && <Line dataKey="target" name={t("Obiectiv zilnic", "Daily goal")} stroke="var(--chart-axis)" strokeDasharray="6 6" dot={false} activeDot={false} />}
                    <Line dataKey="value" name={mode === "steps" ? t("Pași efectuați", "Steps recorded") : t(`Greutate (${unit})`, `Weight (${unit})`)}
                      stroke="var(--chart-cyan)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </ComposedChart>
                ) : (
                  <ComposedChart data={chartData} margin={{ top: 10, right: 5, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: "var(--chart-axis)" }} dy={10} />
                    <YAxis yAxisId="primary" width={52} fontSize={10} tickLine={false} axisLine={false}
                      tick={{ fill: "var(--chart-axis)" }} domain={[0, "auto"]}
                      unit={mode === "strength" ? ` ${unit}` : " min"} />
                    {mode === "strength" && <YAxis yAxisId="reps" orientation="right" width={32}
                      fontSize={10} tickLine={false} axisLine={false} allowDecimals={false}
                      tick={{ fill: "var(--chart-green)" }} domain={[0, "auto"]} />}
                    <Tooltip cursor={{ stroke: "var(--chart-axis)", strokeDasharray: "4 4" }}
                      contentStyle={tooltipStyle} labelStyle={{ color: "var(--foreground)" }} />
                    <Legend wrapperStyle={{ paddingTop: 20, fontSize: 12 }} iconType="circle" />
                    {mode === "strength" ? (<>
                      <Line yAxisId="primary" dataKey="weight" name={t(`Greutate ridicată (${unit})`, `Lifted weight (${unit})`)}
                        stroke="var(--chart-cyan)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                      <Line yAxisId="reps" dataKey="reps" name={t("Repetări", "Reps")}
                        stroke="var(--chart-green)" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4 }} activeDot={{ r: 6 }} />
                      {hasBodyWeights && <Scatter yAxisId="primary" dataKey="bodyWeight"
                        name={t(`Greutate corporală (${unit})`, `Body weight (${unit})`)} fill="var(--chart-rose)" />}
                    </>) : <Line yAxisId="primary" dataKey="duration" name={t("Durată (min)", "Duration (min)")}
                      stroke="var(--chart-rose)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />}
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
          {mode === "strength" && <p className="mt-4 text-xs text-muted-foreground">{t(`Maxime pe sesiune din seturile de lucru: greutate (${unit}) și repetări. Exportul respectă exercițiul și perioada selectate.`, `Session working-set maxima: weight (${unit}) and reps. Export uses the selected exercise and period.`)}</p>}
          {mode === "strength" && <p className="mt-2 text-xs text-muted-foreground">{t(`Greutățile folosesc scala din stânga (${unit}). Repetările folosesc scala verde din dreapta și linia punctată.`, `Weights use the left scale (${unit}). Reps use the green right scale and dashed line.`)}</p>}
          {mode === "strength" && hasBodyWeights && <p className="mt-2 text-xs text-muted-foreground">{t("Punctele roșii arată greutatea corporală înregistrată în ziua antrenamentului. Zilele fără cântărire nu au punct roșu.", "Red dots show body weight recorded on the workout date. Days without a weigh-in have no red dot.")}</p>}
          {mode === "strength" && bodyWeightError && !isLoading && (
            <div role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">
              <p>{t("Greutatea corporală nu a putut fi încărcată. Datele de forță sunt afișate în continuare.", "Body weight could not be loaded. Strength data is still shown.")} ({bodyWeightError})</p>
              <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-2 font-bold underline">{t("Reîncearcă", "Retry")}</button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
