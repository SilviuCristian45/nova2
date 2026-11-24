import {
  PROGRAM_ACCESS_TYPES,
  PROGRAM_DIFFICULTIES,
  PROGRAM_GOALS,
  PROGRAM_STATUSES,
  isValidInviteCode,
  normalizeInviteCode,
  type EnrollmentStatus,
  type ProgramAccessType,
  type ProgramDifficulty,
  type ProgramGoal,
  type ProgramStatus,
} from "./types.ts";

export type Translator = (ro: string, en: string) => string;

export type ProgramExerciseInput = {
  id?: string;
  exercise: string;
  setType: string;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  targetRir: number | null;
  targetWeightKg: number | null;
  restSeconds: number | null;
  notes: string;
};

export type ProgramCardioInput = {
  id?: string;
  activity: string;
  targetDurationMin: number;
  notes: string;
};

export type ProgramWorkoutInput = {
  id?: string;
  weekNumber: number;
  dayNumber: number;
  title: string;
  workoutMode: "strength" | "cardio";
  split: string;
  notes: string;
  exercises: ProgramExerciseInput[];
  cardio: ProgramCardioInput[];
};

export type ProgramPayloadInput = {
  id?: string;
  title: string;
  description: string;
  difficulty: ProgramDifficulty;
  durationWeeks: number;
  goal: ProgramGoal;
  status: ProgramStatus;
  accessType: ProgramAccessType;
  requiresApproval: boolean;
  inviteCode: string | null;
  workouts: ProgramWorkoutInput[];
};

export type ValidatedProgramPayload = Omit<ProgramPayloadInput, "title" | "description" | "inviteCode"> & {
  title: string;
  description: string | null;
  inviteCode: string | null;
};

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(length = 8): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < length; i++) {
    out += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  }
  return out;
}

export function difficultyLabel(value: ProgramDifficulty, t: Translator): string {
  switch (value) {
    case "beginner": return t("Începător", "Beginner");
    case "intermediate": return t("Intermediar", "Intermediate");
    case "advanced": return t("Avansat", "Advanced");
  }
}

export function goalLabel(value: ProgramGoal, t: Translator): string {
  switch (value) {
    case "hypertrophy": return t("Hipertrofie", "Hypertrophy");
    case "strength": return t("Forță", "Strength");
    case "fat_loss": return t("Slăbire", "Fat loss");
    case "endurance": return t("Rezistență", "Endurance");
    case "general_fitness": return t("Fitness general", "General fitness");
  }
}

export function programStatusLabel(value: ProgramStatus, t: Translator): string {
  switch (value) {
    case "draft": return t("Ciornă", "Draft");
    case "published": return t("Publicat", "Published");
    case "archived": return t("Arhivat", "Archived");
  }
}

export function accessTypeLabel(value: ProgramAccessType, t: Translator): string {
  return value === "public" ? t("Public", "Public") : t("Cu invitație", "Invite only");
}

export function enrollmentStatusLabel(value: EnrollmentStatus, t: Translator): string {
  switch (value) {
    case "pending": return t("În așteptare aprobare", "Pending approval");
    case "active": return t("Înscris", "Enrolled");
    case "paused": return t("În pauză", "Paused");
    case "completed": return t("Finalizat", "Completed");
    case "rejected": return t("Respins", "Rejected");
  }
}

export function formatExerciseTarget(
  target: {
    target_sets: number;
    target_reps_min: number;
    target_reps_max: number;
    target_rir: number | null;
    target_weight_kg: number | null;
    rest_seconds?: number | null;
  },
  formatWeight: (kg: number) => string,
  t: Translator,
): string {
  const reps = target.target_reps_min === target.target_reps_max
    ? `${target.target_reps_min}`
    : `${target.target_reps_min}–${target.target_reps_max}`;
  const parts: string[] = [`${target.target_sets}×${reps}`];
  if (target.target_rir !== null && target.target_rir !== undefined) {
    parts.push(`@ RIR ${target.target_rir}`);
  }
  const base = parts.join(" ");
  const extras: string[] = [];
  if (target.target_weight_kg !== null && target.target_weight_kg !== undefined && Number(target.target_weight_kg) > 0) {
    extras.push(formatWeight(Number(target.target_weight_kg)));
  }
  if (target.rest_seconds) {
    extras.push(`${target.rest_seconds}s ${t("pauză", "rest")}`);
  }
  return extras.length > 0 ? `${base} · ${extras.join(" · ")}` : base;
}

export function moveItem<T>(items: readonly T[], index: number, direction: "up" | "down"): T[] {
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return [...items];
  }
  const copy = [...items];
  const [moved] = copy.splice(index, 1);
  copy.splice(target, 0, moved);
  return copy;
}

export function pickNextProgramWorkout<
  T extends { id: string; week_number: number; day_number: number; position: number },
>(workouts: readonly T[], completedWorkoutIds: ReadonlySet<string>, currentWeek = 1): T | null {
  if (workouts.length === 0) return null;
  const sorted = [...workouts].sort(
    (a, b) => a.week_number - b.week_number || a.day_number - b.day_number || a.position - b.position,
  );
  const fromCurrentWeek = sorted.filter((w) => w.week_number >= currentWeek);
  const nextInCurrent = fromCurrentWeek.find((w) => !completedWorkoutIds.has(w.id));
  if (nextInCurrent) return nextInCurrent;
  const anyUncompleted = sorted.find((w) => !completedWorkoutIds.has(w.id));
  return anyUncompleted ?? fromCurrentWeek[0] ?? sorted[0];
}

export function validateProgramPayload(
  input: ProgramPayloadInput,
  t: Translator,
): { ok: true; data: ValidatedProgramPayload } | { ok: false; error: string } {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 120) {
    return { ok: false, error: t("Titlul programului trebuie să aibă între 1 și 120 de caractere.", "Program title must be between 1 and 120 characters.") };
  }
  const description = input.description.trim();
  if (description.length > 2000) {
    return { ok: false, error: t("Descrierea poate avea maxim 2000 de caractere.", "Description can have at most 2000 characters.") };
  }
  if (!PROGRAM_DIFFICULTIES.includes(input.difficulty)) {
    return { ok: false, error: t("Nivel de dificultate invalid.", "Invalid difficulty level.") };
  }
  if (!PROGRAM_GOALS.includes(input.goal)) {
    return { ok: false, error: t("Obiectiv invalid.", "Invalid goal.") };
  }
  if (!PROGRAM_STATUSES.includes(input.status)) {
    return { ok: false, error: t("Status invalid.", "Invalid status.") };
  }
  if (!PROGRAM_ACCESS_TYPES.includes(input.accessType)) {
    return { ok: false, error: t("Tip de acces invalid.", "Invalid access type.") };
  }
  if (!Number.isInteger(input.durationWeeks) || input.durationWeeks < 1 || input.durationWeeks > 52) {
    return { ok: false, error: t("Durata trebuie să fie între 1 și 52 de săptămâni.", "Duration must be between 1 and 52 weeks.") };
  }

  let inviteCode: string | null = null;
  if (input.inviteCode && input.inviteCode.trim().length > 0) {
    const normalized = normalizeInviteCode(input.inviteCode);
    if (!isValidInviteCode(normalized)) {
      return { ok: false, error: t("Codul de invitație trebuie să aibă 6–16 litere sau cifre.", "Invite code must be 6–16 letters or digits.") };
    }
    inviteCode = normalized;
  } else if (input.accessType === "invite_only") {
    inviteCode = generateInviteCode(8);
  }

  if (input.workouts.length > 200) {
    return { ok: false, error: t("Un program poate avea maxim 200 de zile de antrenament.", "A program can have at most 200 workout days.") };
  }

  const normalizedWorkouts: ProgramWorkoutInput[] = [];
  for (let wi = 0; wi < input.workouts.length; wi++) {
    const w = input.workouts[wi];
    const wTitle = w.title.trim();
    if (wTitle.length < 1 || wTitle.length > 120) {
      return { ok: false, error: t(`Ziua #${wi + 1} trebuie să aibă un titlu (1–120 caractere).`, `Day #${wi + 1} needs a title (1–120 characters).`) };
    }
    if (!Number.isInteger(w.weekNumber) || w.weekNumber < 1 || w.weekNumber > input.durationWeeks) {
      return { ok: false, error: t(`Săptămâna pentru „${wTitle}” depășește durata programului.`, `Week for "${wTitle}" exceeds program duration.`) };
    }
    if (!Number.isInteger(w.dayNumber) || w.dayNumber < 1 || w.dayNumber > 7) {
      return { ok: false, error: t(`Ziua din săptămână pentru „${wTitle}” trebuie să fie între 1 și 7.`, `Day of week for "${wTitle}" must be between 1 and 7.`) };
    }
    if (w.workoutMode !== "strength" && w.workoutMode !== "cardio") {
      return { ok: false, error: t("Tip de antrenament invalid.", "Invalid workout mode.") };
    }
    const wSplit = w.workoutMode === "cardio" ? "CARDIO" : w.split.trim();
    if (wSplit.length < 1 || wSplit.length > 100) {
      return { ok: false, error: t(`Selectează un split valid pentru „${wTitle}”.`, `Select a valid split for "${wTitle}".`) };
    }
    if (w.notes.trim().length > 1000) {
      return { ok: false, error: t(`Notițele pentru „${wTitle}” depășesc 1000 de caractere.`, `Notes for "${wTitle}" exceed 1000 characters.`) };
    }

    const exercises: ProgramExerciseInput[] = [];
    const cardio: ProgramCardioInput[] = [];

    if (w.workoutMode === "strength") {
      for (let ei = 0; ei < w.exercises.length; ei++) {
        const ex = w.exercises[ei];
        const exName = ex.exercise.trim();
        if (exName.length < 1 || exName.length > 300) {
          return { ok: false, error: t(`Exercițiul #${ei + 1} din „${wTitle}” este invalid.`, `Exercise #${ei + 1} in "${wTitle}" is invalid.`) };
        }
        if (!Number.isInteger(ex.targetSets) || ex.targetSets < 1 || ex.targetSets > 50) {
          return { ok: false, error: t(`Seturile țintă pentru ${exName} trebuie să fie între 1 și 50.`, `Target sets for ${exName} must be between 1 and 50.`) };
        }
        if (!Number.isInteger(ex.targetRepsMin) || ex.targetRepsMin < 1 || ex.targetRepsMin > 1000) {
          return { ok: false, error: t(`Repetările minime pentru ${exName} sunt invalide.`, `Minimum reps for ${exName} are invalid.`) };
        }
        if (!Number.isInteger(ex.targetRepsMax) || ex.targetRepsMax < ex.targetRepsMin || ex.targetRepsMax > 1000) {
          return { ok: false, error: t(`Repetările maxime pentru ${exName} trebuie să fie >= minim.`, `Maximum reps for ${exName} must be >= minimum.`) };
        }
        if (ex.targetRir !== null && (!Number.isInteger(ex.targetRir) || ex.targetRir < 0 || ex.targetRir > 5)) {
          return { ok: false, error: t(`RIR țintă pentru ${exName} trebuie să fie între 0 și 5.`, `Target RIR for ${exName} must be between 0 and 5.`) };
        }
        if (ex.targetWeightKg !== null && (!Number.isFinite(ex.targetWeightKg) || ex.targetWeightKg < 0 || ex.targetWeightKg > 10000)) {
          return { ok: false, error: t(`Greutatea țintă pentru ${exName} este invalidă.`, `Target weight for ${exName} is invalid.`) };
        }
        if (ex.restSeconds !== null && (!Number.isInteger(ex.restSeconds) || ex.restSeconds < 10 || ex.restSeconds > 900)) {
          return { ok: false, error: t(`Pauza pentru ${exName} trebuie să fie între 10 și 900 secunde.`, `Rest time for ${exName} must be between 10 and 900 seconds.`) };
        }
        if (ex.notes.trim().length > 280) {
          return { ok: false, error: t(`Notița pentru ${exName} poate avea maxim 280 de caractere.`, `Note for ${exName} can have at most 280 characters.`) };
        }
        exercises.push({
          id: ex.id,
          exercise: exName,
          setType: ex.setType.trim() || "Working Set",
          targetSets: ex.targetSets,
          targetRepsMin: ex.targetRepsMin,
          targetRepsMax: ex.targetRepsMax,
          targetRir: ex.targetRir,
          targetWeightKg: ex.targetWeightKg === null ? null : Math.round(ex.targetWeightKg * 100) / 100,
          restSeconds: ex.restSeconds,
          notes: ex.notes.trim(),
        });
      }
    } else {
      for (let ci = 0; ci < w.cardio.length; ci++) {
        const c = w.cardio[ci];
        const act = c.activity.trim();
        if (act.length < 1 || act.length > 120) {
          return { ok: false, error: t(`Activitatea cardio #${ci + 1} din „${wTitle}” este invalidă.`, `Cardio activity #${ci + 1} in "${wTitle}" is invalid.`) };
        }
        if (!Number.isInteger(c.targetDurationMin) || c.targetDurationMin < 1 || c.targetDurationMin > 1440) {
          return { ok: false, error: t(`Durata cardio pentru ${act} trebuie să fie între 1 și 1440 min.`, `Cardio duration for ${act} must be between 1 and 1440 min.`) };
        }
        if (c.notes.trim().length > 280) {
          return { ok: false, error: t(`Notița pentru ${act} poate avea maxim 280 de caractere.`, `Note for ${act} can have at most 280 characters.`) };
        }
        cardio.push({
          id: c.id,
          activity: act,
          targetDurationMin: c.targetDurationMin,
          notes: c.notes.trim(),
        });
      }
    }

    normalizedWorkouts.push({
      id: w.id,
      weekNumber: w.weekNumber,
      dayNumber: w.dayNumber,
      title: wTitle,
      workoutMode: w.workoutMode,
      split: wSplit,
      notes: w.notes.trim(),
      exercises,
      cardio,
    });
  }

  return {
    ok: true,
    data: {
      id: input.id,
      title,
      description: description || null,
      difficulty: input.difficulty,
      durationWeeks: input.durationWeeks,
      goal: input.goal,
      status: input.status,
      accessType: input.accessType,
      requiresApproval: input.requiresApproval,
      inviteCode,
      workouts: normalizedWorkouts,
    },
  };
}
