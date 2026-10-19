export type OfflineSet = {
  split: string; exercise: string; setNumber: number; reps: number;
  weight: number; rir: number; setType: string; notes: string;
};
export type OfflineCardio = { activity: string; durationMin: number };
export type OfflinePayload =
  | { kind: "steps"; date: string; steps: number }
  | { kind: "weight"; date: string; weightKg: number }
  | { kind: "workout"; date: string; mode: "strength" | "cardio"; split: string; sets: OfflineSet[]; cardio: OfflineCardio[] };
export type OfflineMutation = {
  id: string; ownerId: string; createdAt: string; payload: OfflinePayload;
};
export type OfflineWorkout = {
  id: string; performed_on: string; workout_mode: string; split: string;
  workout_sets: {
    id: string; exercise: string; weight: number; reps: number; rir: number;
    set_type: string; set_number: number; notes: string | null;
  }[];
  cardio_sessions: { id: string; activity: string; duration_min: number }[];
  pending?: boolean;
};
export type OfflineSnapshot = {
  ownerId: string; downloadedAt: string; workouts: OfflineWorkout[];
  steps: { date: string; steps: number }[];
  weights: { date: string; weight_kg: number }[];
};
export type OfflineAccount = { snapshot: OfflineSnapshot; queue: OfflineMutation[] };
export type OfflineDatabase = {
  activeOwner: string | null; accounts: Record<string, OfflineAccount>;
  revision: number; enabled: boolean;
};
