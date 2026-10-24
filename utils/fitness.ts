export interface WorkoutSet {
  weight: number | string;
  reps: number | string;
  rir?: number | string | null;
  created_at: string;
  set_type?: string;
  notes?: string | null;
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

  // 1. Găsim data celei mai recente sesiuni (luăm data primului set din listă, fiind deja ordonate descrescător)
  const mostRecentDate = sets[0].created_at.split("T")[0];

  // 2. Filtrăm doar seturile care aparțin acelei zile
  const setsFromLastSession = sets.filter(
    (s) => s.created_at.split("T")[0] === mostRecentDate,
  );

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
