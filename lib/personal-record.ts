// Personal-record rule shared by the workout draft and the exercise hint under the picker.
// A set is a PR when it is heavier than the best known set, or equally heavy with more reps.
// Exercises without a known baseline (nothing logged before) never report a PR.

export type BestSet = { weight: number; reps: number };

export function beatsBest(set: BestSet, best: BestSet): boolean {
  return set.weight > best.weight || (set.weight === best.weight && set.reps > best.reps);
}

// Returns the ids of draft sets that are PRs, walking the draft in order so each set is compared
// with the baseline and with the earlier PRs of the same exercise. Deriving this from the current list
// (instead of storing flags) keeps it correct when a set is removed or the draft is restored.
export function draftPersonalRecords(
  sets: readonly { id: string; exercise: string; weight: number; reps: number; setType?: string }[],
  baselines: Readonly<Record<string, BestSet | null | undefined>>,
): Set<string> {
  const running = new Map<string, BestSet>();
  const records = new Set<string>();
  for (const set of sets) {
    if (isWarmup(set.setType)) continue;
    const best = running.get(set.exercise) ?? baselines[set.exercise];
    if (!best) continue;
    if (beatsBest(set, best)) {
      records.add(set.id);
      running.set(set.exercise, { weight: set.weight, reps: set.reps });
    } else {
      running.set(set.exercise, best);
    }
  }
  return records;
}

// Warmups are never a record and never the bar to beat.
export function isWarmup(setType: string | null | undefined): boolean {
  return setType === "Warmup";
}

// The PR baseline of an exercise: the best set ever logged (heavier, then more reps), warmups excluded.
// This is deliberately not the "last session" set that drives the progression recommendation.
export function bestSetAllTime(
  sets: readonly { weight: number | string; reps: number | string; set_type?: string | null }[],
): BestSet | null {
  let best: BestSet | null = null;
  for (const set of sets) {
    if (isWarmup(set.set_type)) continue;
    const candidate = { weight: Number(set.weight), reps: Number(set.reps) };
    if (!best || beatsBest(candidate, best)) best = candidate;
  }
  return best;
}

export type RecordRow = {
  exercise: string; weight: number; reps: number; rir: number | null; set_type?: string | null; performed_on: string;
};

// Epley estimate, shown next to the best set on /records.
export function estimateOneRepMax(weight: number, reps: number): number {
  if (weight === 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

// Best set per exercise over the whole history, warmups excluded, ordered by estimated 1RM.
export function recordsByExercise(rows: readonly RecordRow[]) {
  const best = new Map<string, RecordRow>();
  for (const row of rows) {
    if (isWarmup(row.set_type)) continue;
    const current = best.get(row.exercise);
    if (!current || beatsBest(row, current)) best.set(row.exercise, row);
  }
  return [...best.values()]
    .map((row) => ({
      exercise: row.exercise, weight: row.weight, reps: row.reps, rir: row.rir, performedOn: row.performed_on,
      oneRM: estimateOneRepMax(row.weight, row.reps),
    }))
    .sort((a, b) => b.oneRM - a.oneRM);
}
