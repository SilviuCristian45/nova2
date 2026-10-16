"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, Search, Activity, Footprints, Download } from "lucide-react";
import {
  ComposedChart, BarChart, Bar, Line, Scatter, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend, ZAxis,
} from "recharts";
import { EXERCISES, CARDIO_ACTIVITIES } from "@/lib/workout-data";
import { createClient } from "@/utils/supabase/client";
import {
  getStrengthProgression, strengthProgressionCsv, type StrengthWorkout,
} from "@/lib/strength-progression";

type ChartMode = "strength" | "cardio" | "steps";
type Workout = StrengthWorkout & {
  cardio_sessions: { activity: string; duration_min: number | null }[] | null;
};
type DailySteps = { date: string; steps: number };
type ChartPoint = {
  date: string;
  weight?: number;
  reps?: number;
  duration?: number;
  pasi?: number;
  targetLine?: number;
  targetScatter?: number | null;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [workoutData, setWorkoutData] = useState<Workout[]>([]);
  const [stepsData, setStepsData] = useState<DailySteps[]>([]);
  const [stepsGoal, setStepsGoal] = useState(10000);
  const [mode, setMode] = useState<ChartMode>("strength");
  const [selectedExercise, setSelectedExercise] = useState<string>(EXERCISES[0]);
  const [selectedCardio, setSelectedCardio] = useState<string>(CARDIO_ACTIVITIES[0]);
  const [timeRange, setTimeRange] = useState(30);
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [isExerciseOpen, setIsExerciseOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw new Error(authError.message);
        if (!user) throw new Error("Sesiune expirată. Autentifică-te din nou.");
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - timeRange);
        const cutoffStr = timeRange === 7300 ? "0001-01-01" : cutoff.toISOString().split("T")[0];
        const endDate = new Date().toISOString().split("T")[0];

        // Supabase caps each response; fetch every page so ALL and CSV are complete.
        const fetchWorkouts = async () => {
          const rows: Workout[] = [];
          for (let from = 0; ; from += PAGE_SIZE) {
            const { data, error } = await supabase.from("workouts")
              .select("performed_on, workout_mode, workout_sets (*), cardio_sessions (*)")
              .eq("user_id", user.id).gte("performed_on", cutoffStr).lte("performed_on", endDate)
              .order("performed_on").order("id").range(from, from + PAGE_SIZE - 1);
            if (error) throw new Error(error.message);
            rows.push(...(data ?? []));
            if (cancelled || !data || data.length < PAGE_SIZE) return rows;
          }
        };
        const fetchSteps = async () => {
          const rows: DailySteps[] = [];
          for (let from = 0; ; from += PAGE_SIZE) {
            const { data, error } = await supabase.from("daily_steps")
              .select("date, steps").eq("user_id", user.id)
              .gte("date", cutoffStr).lte("date", endDate).order("date")
              .range(from, from + PAGE_SIZE - 1);
            if (error) throw new Error(error.message);
            rows.push(...(data ?? []));
            if (cancelled || !data || data.length < PAGE_SIZE) return rows;
          }
        };
        const [workouts, steps, profile] = await Promise.all([
          fetchWorkouts(), fetchSteps(),
          supabase.from("profiles").select("daily_steps_goal").eq("id", user.id).maybeSingle(),
        ]);
        if (profile.error) throw new Error(profile.error.message);
        if (!cancelled) {
          setWorkoutData(workouts);
          setStepsData(steps);
          setStepsGoal(profile.data?.daily_steps_goal || 10000);
        }
      } catch (error) {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : "Nu am putut încărca datele graficului.");
          setWorkoutData([]);
          setStepsData([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchData();
    return () => { cancelled = true; };
  }, [timeRange, retry]);

  const strengthData = getStrengthProgression(workoutData, selectedExercise);
  const chartData: ChartPoint[] = mode === "strength" ? strengthData : mode === "cardio"
    ? workoutData.flatMap((workout) => {
      if (workout.workout_mode !== "cardio") return [];
      const sessions = workout.cardio_sessions?.filter((session) => session.activity === selectedCardio);
      return sessions?.length ? [{
        date: new Date(`${workout.performed_on}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        duration: sessions.reduce((sum, session) => sum + Number(session.duration_min || 0), 0),
      }] : [];
    })
    : stepsData.map((day) => ({
      date: new Date(`${day.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      pasi: day.steps,
      targetLine: stepsGoal,
      targetScatter: day.steps < stepsGoal ? stepsGoal : null,
    }));

  function exportCsv() {
    try {
      const url = URL.createObjectURL(new Blob(
        [strengthProgressionCsv(strengthData, selectedExercise)],
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
      setError("Exportul CSV a eșuat. Încearcă din nou.");
    }
  }

  const exercises = EXERCISES.filter((exercise) => exercise.toLowerCase().includes(exerciseQuery.toLowerCase()));
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col p-5 sm:p-8 bg-background text-foreground">
      <header className="flex items-center gap-3 mb-6">
        <Link href="/" aria-label="Înapoi" className="p-2.5 -ml-2 text-muted-foreground hover:bg-secondary rounded-xl">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Evoluție & Grafice</h1>
      </header>

      <div className="grid grid-cols-3 gap-1 p-1.5 border border-secondary rounded-2xl bg-card mb-6 lg:max-w-xl">
        {([
          ["strength", "Forță", BarChart3],
          ["cardio", "Cardio", Activity],
          ["steps", "Pași", Footprints],
        ] as const).map(([value, label, Icon]) => (
          <button key={value} type="button" onClick={() => setMode(value)} aria-pressed={mode === value}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors ${mode === value ? "bg-secondary text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-700 dark:text-red-400">
          <p>{error}</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)} className="rounded-lg border border-current px-3 py-1.5 text-sm font-bold">Reîncearcă</button>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <section aria-label="Filtre grafic" className={`${surface} flex flex-col gap-5 p-5 relative z-20`}>
          {mode !== "steps" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tracked-exercise" className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                {mode === "strength" ? "Exercițiu Urmărit" : "Activitate Cardio"}
              </label>
              {mode === "strength" ? (
                <div className="relative">
                  <input id="tracked-exercise" type="text"
                    value={isExerciseOpen ? exerciseQuery : selectedExercise}
                    onChange={(event) => { setExerciseQuery(event.target.value); setIsExerciseOpen(true); }}
                    onFocus={() => { setExerciseQuery(""); setIsExerciseOpen(true); }}
                    onBlur={() => setTimeout(() => setIsExerciseOpen(false), 150)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setIsExerciseOpen(false);
                      if (event.key === "Enter" && exercises.length) {
                        setSelectedExercise(exercises[0]); setIsExerciseOpen(false);
                      }
                    }}
                    placeholder="Caută exercițiul..."
                    className={`${field} pr-10 text-cyan-700 dark:text-cyan-400 font-semibold`} />
                  <Search className="absolute right-4 top-3.5 size-4 text-muted-foreground pointer-events-none" />
                  {isExerciseOpen && (
                    <ul className="absolute z-30 top-[52px] left-0 right-0 max-h-60 overflow-y-auto rounded-xl border border-secondary bg-card p-1.5 shadow-xl">
                      {exercises.length ? exercises.map((exercise) => (
                        <li key={exercise}>
                          <button type="button" onMouseDown={(event) => event.preventDefault()}
                            onClick={() => { setSelectedExercise(exercise); setIsExerciseOpen(false); }}
                            className={`w-full text-left rounded-lg px-3 py-2.5 text-sm ${selectedExercise === exercise ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 font-bold" : "hover:bg-secondary"}`}>
                            {exercise}
                          </button>
                        </li>
                      )) : <li className="p-3 text-sm text-muted-foreground">Nu am găsit acest exercițiu.</li>}
                    </ul>
                  )}
                </div>
              ) : (
                <select id="tracked-exercise" value={selectedCardio} onChange={(event) => setSelectedCardio(event.target.value)} className={field}>
                  {CARDIO_ACTIVITIES.map((activity) => <option key={activity}>{activity}</option>)}
                </select>
              )}
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Perioadă Analizată</p>
            <div className="grid grid-cols-4 gap-2">
              {[{ label: "7Z", days: 7 }, { label: "1L", days: 30 }, { label: "1A", days: 365 }, { label: "ALL", days: 7300 }].map((range) => (
                <button key={range.days} type="button" onClick={() => setTimeRange(range.days)} aria-pressed={timeRange === range.days}
                  className={`py-2.5 rounded-xl text-xs font-bold border border-secondary ${timeRange === range.days ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-950" : "bg-background text-muted-foreground hover:bg-secondary"}`}>
                  {range.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section aria-label="Grafic evoluție" className={`${surface} min-w-0 p-4 sm:p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h2 className="font-bold">{mode === "strength" ? selectedExercise : mode === "cardio" ? selectedCardio : "Pași zilnici"}</h2>
            {mode === "strength" && (
              <button type="button" onClick={exportCsv} disabled={loading || !strengthData.length}
                className="flex items-center gap-2 rounded-xl border border-secondary bg-background px-4 py-2.5 text-sm font-bold hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed">
                <Download className="size-4" /> Export CSV
              </button>
            )}
          </div>
          {loading ? (
            <p role="status" className="flex min-h-[300px] items-center justify-center text-muted-foreground">Analizăm datele...</p>
          ) : chartData.length === 0 ? (
            <p className="flex min-h-[300px] items-center justify-center text-center text-muted-foreground">
              {error ? "Graficul nu este disponibil. Reîncearcă încărcarea datelor." : "Nu am găsit date suficiente pentru a genera un grafic în această perioadă."}
            </p>
          ) : (
            <div className="h-[300px] sm:h-[420px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                {mode === "steps" ? (
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: "var(--chart-axis)" }} dy={10} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} tick={{ fill: "var(--chart-axis)" }} domain={[0, (max: number) => Math.max(max, stepsGoal) + 2000]} />
                    <ZAxis range={[60, 60]} />
                    <Tooltip
                      cursor={{ stroke: "var(--chart-axis)", strokeDasharray: "6 6" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const point = payload[0].payload as ChartPoint;
                        const steps = point.pasi ?? 0;
                        const target = point.targetLine ?? stepsGoal;
                        return (
                          <div style={tooltipStyle} className="border shadow-xl text-sm font-bold">
                            <p className="text-xs text-muted-foreground mb-1">{point.date}</p>
                            <p className="text-cyan-700 dark:text-cyan-400">Pași: {steps.toLocaleString("ro-RO")}</p>
                            <p className="text-muted-foreground">Target: {target.toLocaleString("ro-RO")}</p>
                            <p className={steps >= target ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}>
                              {steps >= target ? "OBIECTIV ATINS" : `${(target - steps).toLocaleString("ro-RO")} pași rămași`}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ paddingTop: 25, fontSize: 12 }} iconType="circle" />
                    <Line dataKey="targetLine" name="Target zilnic" stroke="var(--chart-axis)" strokeDasharray="6 6" dot={false} activeDot={false} legendType="none" />
                    <Scatter dataKey="pasi" name="Pași efectuați" fill="var(--chart-cyan)" />
                    <Scatter dataKey="targetScatter" name="Target neatins" fill="var(--chart-rose)" />
                  </ComposedChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: "var(--chart-axis)" }} dy={10} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} tick={{ fill: "var(--chart-axis)" }} />
                    <Tooltip cursor={{ fill: "var(--chart-grid)", opacity: 0.4 }} contentStyle={tooltipStyle} labelStyle={{ color: "var(--foreground)" }} />
                    <Legend wrapperStyle={{ paddingTop: 20, fontSize: 12 }} iconType="circle" />
                    {mode === "strength" ? (<>
                      <Bar dataKey="weight" name="Greutate (kg)" fill="var(--chart-cyan)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="reps" name="Repetări" fill="var(--chart-green)" radius={[4, 4, 0, 0]} />
                    </>) : <Bar dataKey="duration" name="Durată (min)" fill="var(--chart-rose)" radius={[4, 4, 0, 0]} />}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
          {mode === "strength" && <p className="mt-4 text-xs text-muted-foreground">Maxime pe sesiune din seturile de lucru: greutate (kg) și repetări. Exportul respectă exercițiul și perioada selectate.</p>}
        </section>
      </div>
    </main>
  );
}
