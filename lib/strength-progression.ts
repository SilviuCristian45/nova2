export type StrengthWorkout = {
  performed_on: string;
  workout_mode: string;
  workout_sets: {
    exercise: string;
    weight: number | string | null;
    reps: number | string | null;
    set_type: string | null;
    setType?: string;
  }[] | null;
};

export type StrengthPoint = {
  performedOn: string;
  date: string;
  weight: number;
  reps: number;
  bodyWeight?: number | null;
};

export function withBodyWeights(
  points: StrengthPoint[],
  measurements: { date: string; weight_kg: number }[],
): StrengthPoint[] {
  const weightsByDate = new Map(measurements.map((entry) => [entry.date, entry.weight_kg]));
  return points.map((point) => ({
    ...point,
    bodyWeight: weightsByDate.get(point.performedOn) ?? null,
  }));
}

export function getStrengthProgression(
  workouts: StrengthWorkout[],
  exercise: string,
  locale = "en-US",
): StrengthPoint[] {
  return workouts.flatMap((workout) => {
    if (workout.workout_mode !== "strength") return [];
    const sets = workout.workout_sets?.filter(
      (set) =>
        set.exercise === exercise &&
        (set.set_type === "Working Set" ||
          set.setType === "Working Set" ||
          !set.set_type),
    );
    if (!sets?.length) return [];
    return [{
      performedOn: workout.performed_on,
      date: new Date(`${workout.performed_on}T00:00:00`).toLocaleDateString(
        locale,
        { month: "short", day: "numeric" },
      ),
      weight: Math.max(...sets.map((set) => Number(set.weight) || 0)),
      reps: Math.max(...sets.map((set) => Number(set.reps) || 0)),
    }];
  });
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && /^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function strengthProgressionCsv(
  points: StrengthPoint[],
  exercise: string,
): string {
  const includeBodyWeight = points.some((point) => point.bodyWeight != null);
  const rows = [
    ["Date", "Exercise", "Max weight (kg)", "Max reps", ...(includeBodyWeight ? ["Body weight (kg)"] : [])],
    ...points.map((point) => [
      point.performedOn, exercise, point.weight, point.reps,
      ...(includeBodyWeight ? [point.bodyWeight ?? ""] : []),
    ]),
  ];
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
