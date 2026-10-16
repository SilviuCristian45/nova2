export type DailyWeight = { date: string; weight_kg: number };

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isMeasurementDate(value: unknown, today = localDate()): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value >= "0001-01-01" && value <= today;
}

export function parseBodyWeight(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const weight = Number(value.trim().replace(",", "."));
  return Number.isFinite(weight) && weight >= 0.01 && weight <= 9999.99 ? weight : null;
}

export function chartMode(value: string | null): "strength" | "cardio" | "steps" | "weight" {
  return value === "cardio" || value === "steps" || value === "weight" ? value : "strength";
}

export function measurementPoints(
  rows: { date: string; value: number }[],
  locale: string,
) {
  return rows.map((row) => ({
    ...row,
    label: new Date(`${row.date}T00:00:00`).toLocaleDateString(locale, {
      month: "short", day: "numeric",
    }),
  }));
}
