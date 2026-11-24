"use client";

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Text, useLanguage } from "@/app/components/language-provider";
import { useUnits } from "@/app/components/units-provider";
import { exerciseName } from "@/lib/exercise-catalog";
import { getStrengthProgression, type StrengthWorkout } from "@/lib/strength-progression";
import { measurementPoints, type DailyWeight } from "@/lib/daily-metrics";
import { Card, CardTitle, Field, Select } from "@/app/components/ui";

const tooltipStyle = {
  backgroundColor: "var(--inner)",
  border: "none",
  color: "var(--foreground)",
  borderRadius: "14px",
  padding: "10px 12px",
  boxShadow: "0 10px 28px -6px rgba(0, 0, 0, 0.2)",
};
const chartCursor = { stroke: "var(--chart-axis)", strokeDasharray: "4 4", strokeOpacity: 0.6 };
const SHOW_DOTS_MAX = 20;

function makeDot(stroke: string, show: boolean) {
  if (!show) return false;
  return { r: 3.5, fill: "var(--card)", stroke, strokeWidth: 2 };
}

function makeActiveDot(fill: string) {
  return { r: 6, fill, stroke: "var(--card)", strokeWidth: 2.5 };
}

export function ClientCharts({
  workouts,
  weights,
  exercises,
}: {
  workouts: StrengthWorkout[];
  weights: DailyWeight[];
  exercises: string[];
}) {
  const { t, locale, language } = useLanguage();
  const { unit, toUnit } = useUnits();
  const [selectedExercise, setSelectedExercise] = useState<string>(exercises[0] ?? "");

  const activeExercise = exercises.includes(selectedExercise) ? selectedExercise : (exercises[0] ?? "");

  const strengthSeries = useMemo(() => {
    if (!activeExercise) return [];
    const chronological = [...workouts].sort((a, b) => a.performed_on.localeCompare(b.performed_on));
    return getStrengthProgression(chronological, activeExercise, locale).map((pt) => ({
      ...pt,
      weight: Number(toUnit(pt.weight).toFixed(1)),
    }));
  }, [workouts, activeExercise, locale, toUnit]);

  const weightSeries = useMemo(() => {
    const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
    return measurementPoints(
      sorted.map((w) => ({ date: w.date, value: Number(toUnit(w.weight_kg).toFixed(1)) })),
      locale,
    );
  }, [weights, locale, toUnit]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
      {/* Progressive Overload Chart */}
      <Card>
        <CardTitle
          description={
            <Text
              ro="Greutate maximă și repetări maxime pe seturile de lucru (încălzirile sunt excluse)."
              en="Max working-set weight and max reps per session (warmups excluded)."
            />
          }
        >
          <Text ro="Progresie forță (Progressive Overload)" en="Strength progression" />
        </CardTitle>

        {exercises.length === 0 ? (
          <p className="rounded-md bg-inner px-3.5 py-6 text-center text-sm text-muted">
            <Text ro="Niciun exercițiu de forță în acest interval." en="No strength exercises logged in this period." />
          </p>
        ) : (
          <>
            <Field label={<Text ro="Exercițiu" en="Exercise" />}>
              <Select
                searchable
                title={t("Selectează exercițiul", "Select exercise")}
                value={activeExercise}
                onChange={setSelectedExercise}
                options={exercises.map((ex) => ({ value: ex, label: exerciseName(ex, language) }))}
              />
            </Field>

            {strengthSeries.length === 0 ? (
              <p className="rounded-md bg-inner px-3.5 py-6 text-center text-sm text-muted">
                <Text ro="Nu există seturi de lucru pentru acest exercițiu." en="No working sets for this exercise." />
              </p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={strengthSeries} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="client-strength-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--lime-text)" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="var(--lime-text)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="var(--chart-grid)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                      dy={8}
                    />
                    <YAxis
                      yAxisId="left"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                      domain={[0, "auto"]}
                      unit={` ${unit}`}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      tick={{ fill: "var(--ice-text)", fontSize: 11 }}
                      domain={[0, "auto"]}
                    />
                    <Tooltip
                      cursor={chartCursor}
                      contentStyle={tooltipStyle}
                      labelStyle={{ color: "var(--muted)", fontSize: 12 }}
                      itemStyle={{ fontWeight: 600 }}
                    />
                    <Legend wrapperStyle={{ paddingTop: 14, fontSize: 12 }} iconType="circle" />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="weight"
                      name={`${t("Greutate", "Weight")} (${unit})`}
                      stroke="var(--lime-text)"
                      strokeWidth={2.75}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="url(#client-strength-fill)"
                      dot={makeDot("var(--lime-text)", strengthSeries.length <= SHOW_DOTS_MAX)}
                      activeDot={makeActiveDot("var(--lime-text)")}
                      animationDuration={500}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="reps"
                      name={t("Repetări", "Reps")}
                      stroke="var(--ice-text)"
                      strokeDasharray="5 4"
                      strokeWidth={2.25}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={makeDot("var(--ice-text)", strengthSeries.length <= SHOW_DOTS_MAX)}
                      activeDot={makeActiveDot("var(--ice-text)")}
                      animationDuration={500}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Body Weight Chart */}
      <Card>
        <CardTitle
          description={
            <Text
              ro="Cântăriri înregistrate de client în intervalul selectat."
              en="Body weigh-ins recorded by the client in the selected period."
            />
          }
        >
          <Text ro="Evoluție greutate corporală" en="Body weight trend" />
        </CardTitle>

        {weightSeries.length === 0 ? (
          <p className="rounded-md bg-inner px-3.5 py-6 text-center text-sm text-muted">
            <Text ro="Nicio cântărire înregistrată în acest interval." en="No weigh-ins logged in this period." />
          </p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={weightSeries} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="client-weight-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--coral-text)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--coral-text)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="var(--chart-grid)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                  dy={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  domain={[(min: number) => Math.max(0, Math.floor(min - 1)), (max: number) => Math.ceil(max + 1)]}
                  tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                  unit={` ${unit}`}
                />
                <Tooltip
                  cursor={chartCursor}
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: "var(--muted)", fontSize: 12 }}
                  itemStyle={{ fontWeight: 600 }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  name={`${t("Greutate", "Weight")} (${unit})`}
                  stroke="var(--coral-text)"
                  strokeWidth={2.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="url(#client-weight-fill)"
                  dot={makeDot("var(--coral-text)", weightSeries.length <= SHOW_DOTS_MAX)}
                  activeDot={makeActiveDot("var(--coral-text)")}
                  animationDuration={500}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}
