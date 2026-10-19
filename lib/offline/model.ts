import type { OfflineMutation, OfflinePayload, OfflineSnapshot } from "./types";

export function validOfflinePayload(value: unknown, today: string): value is OfflinePayload {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  if (typeof p.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.date) || p.date > today || p.date < "0001-01-01") return false;
  const parsed = new Date(`${p.date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== p.date) return false;
  const number = (v: unknown, min: number, max: number, integer = false): v is number =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isSafeInteger(v));
  const text = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
  if (p.kind === "steps") return number(p.steps, 0, 2147483647, true);
  if (p.kind === "weight") return number(p.weightKg, 0.01, 9999.99) && Math.abs(p.weightKg * 100 - Math.round(p.weightKg * 100)) < 0.000001;
  if (p.kind !== "workout" || !["strength", "cardio"].includes(String(p.mode)) || !text(p.split, 100)) return false;
  if (!Array.isArray(p.sets) || !Array.isArray(p.cardio) || p.sets.length > 1000 || p.cardio.length > 1000) return false;
  if (p.mode === "strength" && (!p.sets.length || p.cardio.length)) return false;
  if (p.mode === "cardio" && (!p.cardio.length || p.sets.length)) return false;
  return p.sets.every((s: unknown) => {
    if (!s || typeof s !== "object") return false;
    const set = s as Record<string, unknown>;
    return text(set.split, 100) && text(set.exercise, 300) && text(set.setType, 100) &&
      number(set.setNumber, 1, 10000, true) && number(set.reps, 1, 100000, true) &&
      number(set.weight, 0, 99999) && number(set.rir, 0, 10) &&
      typeof set.notes === "string" && set.notes.length <= 5000;
  }) && p.cardio.every((c: unknown) => {
    if (!c || typeof c !== "object") return false;
    const entry = c as Record<string, unknown>;
    return text(entry.activity, 300) && number(entry.durationMin, 0.01, 1440);
  });
}

export function applyMutation(snapshot: OfflineSnapshot, mutation: OfflineMutation): OfflineSnapshot {
  if (snapshot.ownerId !== mutation.ownerId) throw new Error("Offline account mismatch.");
  const p = mutation.payload;
  if (p.kind === "steps") return {
    ...snapshot, steps: [...snapshot.steps.filter((r) => r.date !== p.date), { date: p.date, steps: p.steps }].sort((a, b) => a.date.localeCompare(b.date)),
  };
  if (p.kind === "weight") return {
    ...snapshot, weights: [...snapshot.weights.filter((r) => r.date !== p.date), { date: p.date, weight_kg: p.weightKg }].sort((a, b) => a.date.localeCompare(b.date)),
  };
  return {
    ...snapshot,
    workouts: [{
      id: mutation.id, performed_on: p.date, workout_mode: p.mode, split: p.mode === "strength" ? p.split : "CARDIO", pending: true,
      workout_sets: p.sets.map((s, i) => ({
        id: `${mutation.id}-${i}`, exercise: s.exercise, weight: s.weight, reps: s.reps, rir: s.rir,
        set_type: s.setType, set_number: s.setNumber, notes: s.notes || null,
      })),
      cardio_sessions: p.cardio.map((c, i) => ({ id: `${mutation.id}-${i}`, activity: c.activity, duration_min: c.durationMin })),
    }, ...snapshot.workouts.filter((w) => w.id !== mutation.id)].sort((a, b) => b.performed_on.localeCompare(a.performed_on)),
  };
}

export function mergeSnapshot(snapshot: OfflineSnapshot, queue: OfflineMutation[]): OfflineSnapshot {
  return queue.reduce(applyMutation, snapshot);
}
