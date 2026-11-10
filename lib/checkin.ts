// Daily check-in: three 1-10 scores (energy, satiety, sleep quality) and a short note. Every field is optional,
// but a check-in cannot be completely empty. The limits are the same in the table constraints, in
// sync_offline_entry and in lib/offline/model.ts.

export const CHECKIN_NOTE_MAX = 280;

export type CheckinValues = { energy: number | null; satiety: number | null; sleep: number | null; note: string };

export function emptyCheckin(): CheckinValues {
  return { energy: null, satiety: null, sleep: null, note: "" };
}

export function hasCheckinContent(values: CheckinValues): boolean {
  return values.energy !== null || values.satiety !== null || values.sleep !== null || values.note.trim().length > 0;
}

// "" / null / undefined mean "not answered"; anything else must be an integer from 1 to 10. `undefined` = invalid.
export function parseScore(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === "") return null;
  if (!/^\d{1,2}$/.test(text)) return undefined;
  const score = Number(text);
  return score >= 1 && score <= 10 ? score : undefined;
}

export function parseCheckin(input: { energy?: unknown; satiety?: unknown; sleep?: unknown; note?: unknown }): CheckinValues | null {
  const energy = parseScore(input.energy);
  const satiety = parseScore(input.satiety);
  const sleep = parseScore(input.sleep);
  if (energy === undefined || satiety === undefined || sleep === undefined) return null;
  const note = typeof input.note === "string" ? input.note.trim() : input.note == null ? "" : null;
  if (note === null || note.length > CHECKIN_NOTE_MAX) return null;
  const values = { energy, satiety, sleep, note };
  return hasCheckinContent(values) ? values : null;
}

// Daily scores for the chart: one point per date, missing answers stay empty (never zero).
export function checkinSeries(rows: readonly ({ date: string } & CheckinValues)[]) {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({ date: row.date, energy: row.energy, satiety: row.satiety, sleep: row.sleep }));
}
