"use client";

import { useMemo, useState } from "react";
import {
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
};

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
                  <ComposedChart data={strengthSeries} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="date" tick={{ fill: "var(--chart-axis)", fontSize: 12 }} />
                    <YAxis yAxisId="left" tick={{ fill: "var(--chart-axis)", fontSize: 12 }} unit={` ${unit}`} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: "var(--chart-axis)", fontSize: 12 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="weight"
                      name={`${t("Greutate", "Weight")} (${unit})`}
                      stroke="var(--ice)"
                      strokeWidth={2.5}
                      dot={{ r: 3.5 }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="reps"
                      name={t("Repetări", "Reps")}
                      stroke="var(--lime)"
                      strokeDasharray="4 4"
                      strokeWidth={2}
                      dot={{ r: 3 }}
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
              <ComposedChart data={weightSeries} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="label" tick={{ fill: "var(--chart-axis)", fontSize: 12 }} />
                <YAxis
                  domain={["dataMin - 1", "dataMax + 1"]}
                  tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
                  unit={` ${unit}`}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="value"
                  name={`${t("Greutate", "Weight")} (${unit})`}
                  stroke="var(--coral)"
                  strokeWidth={2.5}
                  dot={{ r: 3.5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}
