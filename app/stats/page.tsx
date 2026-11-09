"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
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
import { cardioName, exerciseName as localizedExercise } from "@/lib/exercise-catalog";
import { Button, Card, Field, Label, Screen, Segmented, Select, TextLink } from "@/app/components/ui";

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
// Tooltips look like an inner surface: filled, no border.
const tooltipStyle = {
  backgroundColor: "var(--inner)",
  border: "none",
  color: "var(--foreground)",
  borderRadius: "14px",
  padding: "10px 12px",
};
const tooltipClass = "rounded-md bg-inner px-3 py-2.5 text-sm font-semibold shadow-lg";

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
  const measurementMode = mode === "steps" || mode === "weight";
  const chartTitle = mode === "strength" ? localizedExercise(selectedExercise, language) : mode === "cardio" ? cardioName(selectedCardio, language)
    : mode === "steps" ? t("Pași zilnici", "Daily steps") : t(`Greutate corporală (${unit})`, `Body weight (${unit})`);

  return (
    <Screen title={t("Progresie și grafice", "Progress & Charts")}>
      <Segmented
        label={t("Tip de grafic", "Chart type")}
        value={mode}
        onChange={(value) => router.replace(`/stats?mode=${value}`, { scroll: false })}
        options={[
          { value: "strength", label: t("Forță", "Strength") },
          { value: "cardio", label: t("Cardio", "Cardio") },
          { value: "steps", label: t("Pași", "Steps") },
          { value: "weight", label: t("Greutate", "Weight") },
        ]}
      />

      {error && !isLoading && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-red-soft p-3.5 text-sm font-semibold text-red-text">
          <p>{errorMessage}</p>
          <Button variant="soft" tone="red" small onClick={() => setRetry((value) => value + 1)}>{t("Reîncearcă", "Retry")}</Button>
        </div>
      )}

      <Card aria-label={t("Filtre grafic", "Chart filters")}>
        {!measurementMode && (
          <Field label={mode === "strength" ? t("Exercițiu urmărit", "Tracked exercise") : t("Activitate cardio", "Cardio activity")}>
            {mode === "strength" ? (
              <Select searchable title={t("Exercițiu urmărit", "Tracked exercise")} value={selectedExercise} onChange={setSelectedExercise}
                options={EXERCISES.map((exercise) => ({ value: exercise, label: localizedExercise(exercise, language) }))} />
            ) : (
              <Select title={t("Activitate cardio", "Cardio activity")} value={selectedCardio} onChange={setSelectedCardio}
                options={CARDIO_ACTIVITIES.map((activity) => ({ value: activity, label: cardioName(activity, language) }))} />
            )}
          </Field>
        )}
        <div className="flex flex-col gap-1.5">
          <Label>{t("Perioadă analizată", "Time period")}</Label>
          <Segmented inCard label={t("Perioadă analizată", "Time period")} value={String(timeRange)} onChange={(value) => setTimeRange(Number(value))}
            options={[
              { label: t("7Z", "7D"), days: 7 }, { label: t("1L", "1M"), days: 30 }, { label: t("3L", "3M"), days: 90 }, { label: t("6L", "6M"), days: 180 },
              { label: t("1A", "1Y"), days: 365 }, { label: t("2A", "2Y"), days: 730 }, { label: t("TOT", "ALL"), days: 7300 },
            ].map((range) => ({ value: String(range.days), label: range.label }))} />
        </div>
        {measurementMode && (
          <p className="text-[13px] text-soft">
            {mode === "steps"
              ? t("Pașii înregistrați zilnic și obiectivul tău curent.", "Your recorded daily steps and current goal.")
              : t(`Cântăririle tale în ${unit}. Zilele fără înregistrări nu sunt considerate zero.`, `Your weigh-ins in ${unit}. Days without an entry are not counted as zero.`)}
          </p>
        )}
      </Card>

      <Card aria-label={t("Grafic evoluție", "Progress chart")} className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[20px] font-semibold tracking-[-0.4px]">{chartTitle}</h2>
          {mode === "strength" && (
            <Button variant="secondary" small icon={Download} onClick={exportCsv} disabled={isLoading || !strengthData.length}>
              {t("Exportă CSV", "Export CSV")}
            </Button>
          )}
        </div>
        {isLoading ? (
          <p role="status" className="flex min-h-[300px] items-center justify-center text-muted">{t("Analizăm datele...", "Loading chart data...")}</p>
        ) : chartData.length === 0 || (error && error !== "export-failed") ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-center text-muted">
            <p className="font-medium">{error
              ? t("Graficul nu este disponibil. Reîncearcă încărcarea datelor.", "Chart unavailable. Please retry loading.")
              : t("Nu există înregistrări în această perioadă.", "No entries in this period.")}</p>
            {measurementMode && !error && <TextLink href="/">{t("Adaugă o înregistrare", "Add an entry")}</TextLink>}
          </div>
        ) : (
          <div className="h-[300px] w-full min-w-0 sm:h-[380px]">
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
                        <div className={tooltipClass}>
                          <p className="mb-1 text-xs text-muted">{point.date}</p>
                          <p className={mode === "steps" ? "text-lime-text" : "text-lilac-text"}>{mode === "steps" ? t("Pași", "Steps") : t("Greutate", "Weight")}: {value.toLocaleString(locale)}{mode === "weight" ? ` ${unit}` : ""}</p>
                          {mode === "steps" && <>
                            <p className="text-muted">{t("Obiectiv", "Goal")}: {stepsGoal.toLocaleString(locale)}</p>
                            <p className={value >= stepsGoal ? "text-lime-text" : "text-gold-text"}>
                              {value >= stepsGoal ? t("Obiectiv atins", "Goal reached") : `${(stepsGoal - value).toLocaleString(locale)} ${t("pași rămași", "steps remaining")}`}
                            </p>
                          </>}
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: 25, fontSize: 12 }} iconType="circle" />
                  {mode === "steps" && <Line dataKey="target" name={t("Obiectiv zilnic", "Daily goal")} stroke="var(--chart-axis)" strokeDasharray="6 6" dot={false} activeDot={false} />}
                  <Line dataKey="value" name={mode === "steps" ? t("Pași efectuați", "Steps recorded") : t(`Greutate (${unit})`, `Weight (${unit})`)}
                    stroke={mode === "steps" ? "var(--lime-text)" : "var(--lilac-text)"} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
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
                    tick={{ fill: "var(--ice-text)" }} domain={[0, "auto"]} />}
                  <Tooltip cursor={{ stroke: "var(--chart-axis)", strokeDasharray: "4 4" }}
                    contentStyle={tooltipStyle} labelStyle={{ color: "var(--muted)", fontSize: 12 }} itemStyle={{ fontWeight: 600 }} />
                  <Legend wrapperStyle={{ paddingTop: 20, fontSize: 12 }} iconType="circle" />
                  {mode === "strength" ? (<>
                    <Line yAxisId="primary" dataKey="weight" name={t(`Greutate ridicată (${unit})`, `Lifted weight (${unit})`)}
                      stroke="var(--lime-text)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line yAxisId="reps" dataKey="reps" name={t("Repetări", "Reps")}
                      stroke="var(--ice-text)" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    {hasBodyWeights && <Scatter yAxisId="primary" dataKey="bodyWeight"
                      name={t(`Greutate corporală (${unit})`, `Body weight (${unit})`)} fill="var(--lilac-text)" />}
                  </>) : <Line yAxisId="primary" dataKey="duration" name={t("Durată (min)", "Duration (min)")}
                    stroke="var(--coral-text)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />}
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
        {mode === "strength" && <p className="text-xs text-muted">{t(`Maxime pe sesiune din seturile de lucru: greutate (${unit}) și repetări. Exportul respectă exercițiul și perioada selectate.`, `Session working-set maxima: weight (${unit}) and reps. Export uses the selected exercise and period.`)}</p>}
        {mode === "strength" && <p className="text-xs text-muted">{t(`Greutățile folosesc scala din stânga (${unit}). Repetările folosesc scala albastră din dreapta și linia punctată.`, `Weights use the left scale (${unit}). Reps use the blue right scale and dashed line.`)}</p>}
        {mode === "strength" && hasBodyWeights && <p className="text-xs text-muted">{t("Punctele mov arată greutatea corporală înregistrată în ziua antrenamentului. Zilele fără cântărire nu au punct.", "Purple dots show body weight recorded on the workout date. Days without a weigh-in have no dot.")}</p>}
        {mode === "strength" && bodyWeightError && !isLoading && (
          <div role="alert" className="text-sm font-semibold text-red-text">
            <p>{t("Greutatea corporală nu a putut fi încărcată. Datele de forță sunt afișate în continuare.", "Body weight could not be loaded. Strength data is still shown.")} ({bodyWeightError})</p>
            <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-2 font-bold underline">{t("Reîncearcă", "Retry")}</button>
          </div>
        )}
      </Card>
    </Screen>
  );
}
