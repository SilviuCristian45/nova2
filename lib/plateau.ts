// Plateau detection for one exercise: how many sessions have passed since the best result, measured by the
// estimated 1RM of the best non-warmup set of each session (Epley, like /records). Bodyweight sets (weight 0)
// are scored by reps. Two workouts on the same date count as one session.

import { isWarmup } from "./personal-record.ts";

// A plateau is this many sessions in a row without beating the best result. Kept in one place so it is easy to tune.
export const PLATEAU_SESSIONS = 4;

export type PlateauSet = { weight: number | string; reps: number | string; set_type?: string | null; performed_on: string };

export type PlateauStatus = {
  plateau: boolean;
  // Sessions logged after the best one (0 = the latest session is the best).
  sessionsSinceBest: number;
  sessions: number;
};

function score(weight: number, reps: number): number {
  return weight > 0 ? weight * (1 + reps / 30) : reps;
}

// Best score per session date, newest session first.
export function sessionScores(sets: readonly PlateauSet[]): { date: string; score: number }[] {
  const byDate = new Map<string, number>();
  for (const set of sets) {
    if (isWarmup(set.set_type)) continue;
    const value = score(Number(set.weight), Number(set.reps));
    if (!Number.isFinite(value)) continue;
    byDate.set(set.performed_on, Math.max(byDate.get(set.performed_on) ?? 0, value));
  }
  return [...byDate].map(([date, value]) => ({ date, score: value })).sort((a, b) => b.date.localeCompare(a.date));
}

// null when there is not enough history to say anything (fewer than `window + 1` sessions).
export function detectPlateau(sets: readonly PlateauSet[], window = PLATEAU_SESSIONS): PlateauStatus | null {
  const sessions = sessionScores(sets);
  if (sessions.length <= window) return null;
  const best = Math.max(...sessions.map((session) => session.score));
  // The earliest session that reached the best: matching it again later is not progress.
  let bestIndex = 0;
  sessions.forEach((session, index) => { if (session.score === best) bestIndex = index; });
  return { plateau: bestIndex >= window, sessionsSinceBest: bestIndex, sessions: sessions.length };
}

// Same data from locally stored workouts (/offline).
export function setsFromWorkouts(
  workouts: readonly { performed_on: string; workout_sets: readonly { exercise: string; weight: number | string; reps: number | string; set_type?: string | null }[] }[],
  exercise: string,
): PlateauSet[] {
  return workouts.flatMap((workout) => workout.workout_sets
    .filter((set) => set.exercise === exercise)
    .map((set) => ({ weight: set.weight, reps: set.reps, set_type: set.set_type, performed_on: workout.performed_on })));
}
