export const DEFAULT_ADHERENCE_DAYS = 5;

export type ClientAdherence =
  | { kind: "on_track"; daysSinceWorkout: number }
  | { kind: "inactive"; daysSinceWorkout: number }
  | { kind: "new_no_workouts"; daysSinceStart: number }
  | { kind: "new_overdue"; daysSinceStart: number };

export function daysBetweenDates(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${toYmd.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}

// Distinguishes active clients who paused training from newly enrolled clients who haven't logged a first workout yet.
export function classifyClientAdherence(
  input: {
    lastWorkoutDate: string | null;
    enrollmentStartedAt: string | null;
  },
  todayYmd: string,
  thresholdDays = DEFAULT_ADHERENCE_DAYS,
): ClientAdherence {
  if (input.lastWorkoutDate) {
    const days = daysBetweenDates(input.lastWorkoutDate, todayYmd);
    if (days >= thresholdDays) {
      return { kind: "inactive", daysSinceWorkout: days };
    }
    return { kind: "on_track", daysSinceWorkout: days };
  }

  const startYmd = input.enrollmentStartedAt ? input.enrollmentStartedAt.slice(0, 10) : todayYmd;
  const daysSinceStart = daysBetweenDates(startYmd, todayYmd);
  if (daysSinceStart >= thresholdDays) {
    return { kind: "new_overdue", daysSinceStart };
  }
  return { kind: "new_no_workouts", daysSinceStart };
}

export function averageRir(
  sets: readonly { rir: number | null; set_type?: string | null }[],
): number | null {
  let sum = 0;
  let count = 0;
  for (const s of sets) {
    if (s.set_type === "Warmup") continue;
    if (s.rir === null || s.rir === undefined || !Number.isFinite(s.rir)) continue;
    sum += Number(s.rir);
    count += 1;
  }
  if (count === 0) return null;
  return Math.round((sum / count) * 10) / 10;
}

export type DailyNutritionSummary = {
  date: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  mealsCount: number;
};

export type NutritionPeriodSummary = {
  days: DailyNutritionSummary[];
  daysLogged: number;
  avgKcal: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
};

export function summarizeNutritionByDay(
  meals: readonly {
    performed_on: string;
    meal_items?: readonly {
      total_kcal: number | string | null;
      total_protein_g: number | string | null;
      total_carbs_g: number | string | null;
      total_fat_g: number | string | null;
    }[] | null;
  }[],
): NutritionPeriodSummary {
  const byDate = new Map<string, DailyNutritionSummary>();
  for (const meal of meals) {
    const entry = byDate.get(meal.performed_on) ?? {
      date: meal.performed_on,
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      mealsCount: 0,
    };
    entry.mealsCount += 1;
    for (const item of meal.meal_items ?? []) {
      entry.kcal += Number(item.total_kcal) || 0;
      entry.protein += Number(item.total_protein_g) || 0;
      entry.carbs += Number(item.total_carbs_g) || 0;
      entry.fat += Number(item.total_fat_g) || 0;
    }
    byDate.set(meal.performed_on, entry);
  }

  const days = [...byDate.values()]
    .map((d) => ({
      ...d,
      kcal: Math.round(d.kcal),
      protein: Math.round(d.protein),
      carbs: Math.round(d.carbs),
      fat: Math.round(d.fat),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const daysLogged = days.length;
  if (daysLogged === 0) {
    return { days: [], daysLogged: 0, avgKcal: 0, avgProtein: 0, avgCarbs: 0, avgFat: 0 };
  }
  const sum = days.reduce(
    (acc, d) => ({
      kcal: acc.kcal + d.kcal,
      protein: acc.protein + d.protein,
      carbs: acc.carbs + d.carbs,
      fat: acc.fat + d.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return {
    days,
    daysLogged,
    avgKcal: Math.round(sum.kcal / daysLogged),
    avgProtein: Math.round(sum.protein / daysLogged),
    avgCarbs: Math.round(sum.carbs / daysLogged),
    avgFat: Math.round(sum.fat / daysLogged),
  };
}

export function parseRangeDays(raw: string | undefined): 30 | 90 | 180 {
  if (raw === "90") return 90;
  if (raw === "180") return 180;
  return 30;
}

export function cutoffDateYmd(todayYmd: string, days: number): string {
  const dt = new Date(`${todayYmd.slice(0, 10)}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}
