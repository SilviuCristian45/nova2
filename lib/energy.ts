// Calorie and macro recommendations from the profile, the weigh-ins and the logged meals.
// Everything is in kg, cm and kcal.

export const KCAL_PER_KG = 7700;
export const WINDOW_DAYS = 28;

export const ACTIVITY_LEVELS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
} as const;
export type ActivityLevel = keyof typeof ACTIVITY_LEVELS;

export type EnergyInput = {
  sex: "male" | "female" | null;
  heightCm: number | null;
  birthDate: string | null;
  activityLevel: ActivityLevel | null;
  goalKgPerWeek: number;
  // Weigh-ins and per-day intake from the last WINDOW_DAYS days, oldest first
  weights: { date: string; weightKg: number }[];
  intake: { date: string; kcal: number }[];
  today: string;
};

export type EnergyResult = {
  weightKg: number | null;
  bmr: number | null;
  formulaTdee: number | null;
  // kg/week from the weigh-ins, negative when losing
  trendKgPerWeek: number | null;
  loggedDays: number;
  averageIntake: number | null;
  adaptiveTdee: number | null;
  tdee: number | null;
  source: "adaptive" | "formula" | null;
  targets: { kcal: number; protein: number; carbs: number; fat: number; fiber: number } | null;
  // Target minus what the user eats now; null without logged meals
  intakeChange: number | null;
  floorApplied: boolean;
  missing: ("sex" | "height" | "birthDate" | "activity" | "weight")[];
};

const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000;

export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

export function mifflinStJeor(weightKg: number, heightCm: number, age: number, sex: "male" | "female"): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
}

// Least-squares slope of weight over time. Needs at least 3 weigh-ins spread over 10+ days,
// otherwise day-to-day water swings dominate.
export function weightTrendKgPerWeek(weights: { date: string; weightKg: number }[]): number | null {
  if (weights.length < 3) return null;
  const xs = weights.map((w) => day(w.date));
  if (Math.max(...xs) - Math.min(...xs) < 10) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = weights.reduce((a, w) => a + w.weightKg, 0) / weights.length;
  let num = 0, den = 0;
  weights.forEach((w, i) => { num += (xs[i] - mx) * (w.weightKg - my); den += (xs[i] - mx) ** 2; });
  return den === 0 ? null : (num / den) * 7;
}

export function macrosFor(kcal: number, weightKg: number, goalKgPerWeek: number) {
  // Higher protein while cutting protects muscle; fat ~25% of energy with a 0.6 g/kg floor.
  const protein = Math.round(weightKg * (goalKgPerWeek < 0 ? 2 : 1.8));
  const fat = Math.round(Math.max((kcal * 0.25) / 9, weightKg * 0.6));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const fiber = Math.round((kcal / 1000) * 14);
  return { protein, carbs, fat, fiber };
}

export function recommendEnergy(input: EnergyInput): EnergyResult {
  const latest = input.weights.at(-1)?.weightKg ?? null;
  const missing: EnergyResult["missing"] = [];
  if (!input.sex) missing.push("sex");
  if (!input.heightCm) missing.push("height");
  if (!input.birthDate) missing.push("birthDate");
  if (!input.activityLevel) missing.push("activity");
  if (latest === null) missing.push("weight");

  const bmr = latest !== null && input.sex && input.heightCm && input.birthDate
    ? mifflinStJeor(latest, input.heightCm, ageOn(input.birthDate, input.today), input.sex)
    : null;
  const formulaTdee = bmr !== null && input.activityLevel ? bmr * ACTIVITY_LEVELS[input.activityLevel] : null;

  const trend = weightTrendKgPerWeek(input.weights);
  // Today is still being logged, so it would pull the average down.
  const logged = input.intake.filter((d) => d.date < input.today && d.kcal > 0);
  const averageIntake = logged.length ? logged.reduce((a, d) => a + d.kcal, 0) / logged.length : null;
  // Energy balance: what you eat minus what the scale says you stored.
  const adaptiveTdee = trend !== null && averageIntake !== null && logged.length >= 10
    ? averageIntake - (trend * KCAL_PER_KG) / 7
    : null;

  const tdee = adaptiveTdee ?? formulaTdee;
  let targets: EnergyResult["targets"] = null;
  let floorApplied = false;
  if (tdee !== null && latest !== null) {
    let kcal = tdee + (input.goalKgPerWeek * KCAL_PER_KG) / 7;
    const floor = input.sex === "male" ? 1500 : 1200;
    if (kcal < floor) { kcal = floor; floorApplied = true; }
    kcal = Math.round(kcal / 10) * 10;
    targets = { kcal, ...macrosFor(kcal, latest, input.goalKgPerWeek) };
  }

  return {
    weightKg: latest,
    bmr: bmr === null ? null : Math.round(bmr),
    formulaTdee: formulaTdee === null ? null : Math.round(formulaTdee),
    trendKgPerWeek: trend === null ? null : Math.round(trend * 100) / 100,
    loggedDays: logged.length,
    averageIntake: averageIntake === null ? null : Math.round(averageIntake),
    adaptiveTdee: adaptiveTdee === null ? null : Math.round(adaptiveTdee),
    tdee: tdee === null ? null : Math.round(tdee),
    source: adaptiveTdee !== null ? "adaptive" : formulaTdee !== null ? "formula" : null,
    targets,
    intakeChange: targets && averageIntake !== null ? Math.round(targets.kcal - averageIntake) : null,
    floorApplied,
    missing,
  };
}
