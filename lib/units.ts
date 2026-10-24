// Weights are always stored in kg; the user's unit only changes what is shown and typed in.
export type WeightUnit = "kg" | "lb";

export const WEIGHT_UNIT_COOKIE = "weight_unit";
export const KG_PER_LB = 0.45359237;

export function parseWeightUnit(value: unknown): WeightUnit {
  return value === "lb" ? "lb" : "kg";
}

// lb are shown with one decimal: kg are stored with two, so a typed 135 lb comes back as 135, not 134.99.
export function kgToUnit(kg: number, unit: WeightUnit): number {
  return unit === "lb" ? Math.round((kg / KG_PER_LB) * 10) / 10 : Math.round(kg * 100) / 100;
}

export function unitToKg(value: number, unit: WeightUnit): number {
  return Math.round((unit === "lb" ? value * KG_PER_LB : value) * 100) / 100;
}

export function formatWeight(kg: number, unit: WeightUnit, locale = "en-US"): string {
  return `${kgToUnit(kg, unit).toLocaleString(locale)} ${unit}`;
}

// Smallest usual plate jump for progression: 2.5 kg or 5 lb.
export function progressionStepKg(unit: WeightUnit): number {
  return unit === "lb" ? 5 * KG_PER_LB : 2.5;
}
