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
  sets: readonly { id: string; exercise: string; weight: number; reps: number }[],
  baselines: Readonly<Record<string, BestSet | null | undefined>>,
): Set<string> {
  const running = new Map<string, BestSet>();
  const records = new Set<string>();
  for (const set of sets) {
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
