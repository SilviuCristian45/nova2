export interface WorkoutSet {
  weight: number | string;
  reps: number | string;
  rir?: number | string | null;
  created_at: string;
  set_type?: string;
  notes?: string | null;
  // Joined parent workout (`workouts!inner(performed_on)`); PostgREST returns one object for a to-one relation.
  workouts?: { performed_on: string } | { performed_on: string }[] | null;
}

function sessionDay(set: WorkoutSet): string {
  const parent = Array.isArray(set.workouts) ? set.workouts[0] : set.workouts;
  return parent?.performed_on ?? set.created_at.split("T")[0];
}

export interface PredictionResult {
  recommendedWeight: number;
  recommendedReps: number;
  message: string;
}

// utils/fitness.ts sau direct în fișierul tău
export function getBestSetFromLastSession(
  sets: WorkoutSet[],
): WorkoutSet | null {
  if (!sets || sets.length === 0) return null;

  // 1. Cea mai recentă sesiune = cea mai nouă dată a antrenamentului (performed_on), nu momentul inserării
  //    (created_at): un antrenament offline sincronizat târziu sau unul importat nu trebuie să pară "ultimul".
  const mostRecentDate = sets.map(sessionDay).reduce((a, b) => (b > a ? b : a));

  // 2. Filtrăm doar seturile care aparțin acelei zile
  const setsFromLastSession = sets.filter((s) => sessionDay(s) === mostRecentDate);

  if (setsFromLastSession.length === 0) return null;

  // 3. Găsim setul cel mai bun din acea zi (prioritate: greutate mai mare, apoi repetări mai multe)
  const bestSet = setsFromLastSession.reduce((prev, current) => {
    const prevWeight = Number(prev.weight);
    const currentWeight = Number(current.weight);

    if (prevWeight > currentWeight) return prev;
    if (prevWeight < currentWeight) return current;

    // Dacă greutatea este egală, câștigă cel cu mai multe repetări
    return Number(prev.reps) > Number(current.reps) ? prev : current;
  });

  return bestSet;
}

export function calculateProgression(
  bestSet: WorkoutSet | null,
  // Weights are kg: formatWeight shows them in the user's unit, stepKg is the plate jump (2.5 kg / 5 lb)
  formatWeight: (kg: number) => string = (kg) => `${kg}kg`,
  stepKg = 2.5,
): PredictionResult {
  if (!bestSet) {
    return {
      recommendedWeight: 0,
      recommendedReps: 8,
      message: "Exercițiu nou. Setează prima greutate de referință!",
    };
  }

  const weight = Number(bestSet.weight);
  const reps = Number(bestSet.reps);
  const rir =
    bestSet.rir !== null && bestSet.rir !== undefined ? Number(bestSet.rir) : 2;

  const TARGET_REPS = 10;

  if (reps >= TARGET_REPS && rir <= 2) {
    const newWeight = weight + stepKg;
    return {
      recommendedWeight: newWeight,
      recommendedReps: 6,
      message: `🏆 Data trecută ai făcut ${formatWeight(weight)} × ${reps} reps (RIR ${rir}). Azi urcăm la ${formatWeight(newWeight)} pentru 8 repetări!`,
    };
  } else {
    const newReps = reps + 1;
    return {
      recommendedWeight: weight,
      recommendedReps: newReps,
      message: `🏆 Păstrăm ${formatWeight(weight)}. Ținta de azi: încearcă să scoți ${newReps} repetări (data trecută ai avut ${reps}).`,
    };
  }
}
