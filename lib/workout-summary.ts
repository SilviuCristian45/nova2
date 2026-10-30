// Content of the shareable workout card. Pure data: the canvas drawing lives in workout-summary-canvas.ts,
// so the text, grouping and truncation rules can be tested without a browser.
import { cardioName, exerciseName } from "./exercise-catalog.ts";

export type SummarySet = { id: string; exercise: string; weight: number; reps: number; setType: string };
export type SummaryCardio = { activity: string; durationMin: number };

export type SummaryInput = {
  date: string; // YYYY-MM-DD, the day the workout was logged
  mode: "strength" | "cardio";
  title: string; // already localized (split name or "Cardio")
  durationSec: number | null; // only when the user ran the workout timer
  sets: readonly SummarySet[];
  cardio: readonly SummaryCardio[];
  recordIds: ReadonlySet<string>;
};

export type SummaryOptions = {
  language: "ro" | "en";
  locale: string;
  formatWeight: (kg: number) => string;
};

export type SummaryExercise = {
  name: string;
  sets: string[]; // first MAX_SETS_PER_EXERCISE sets
  hiddenSets: number;
  totalSets: number;
  top: string; // heaviest set, used by the densest layout
  record: boolean;
};

export type WorkoutSummary = {
  title: string;
  dateLabel: string;
  stats: { label: string; value: string }[];
  exercises: SummaryExercise[];
  records: { name: string; text: string }[];
};

// Every exercise and every record is kept; the layout decides how densely to draw them.
export const MAX_SETS_PER_EXERCISE = 6;

const COPY = {
  ro: { exercises: "Exerciții", sets: "Seturi", volume: "Volum", duration: "Durată", activities: "Activități", minutes: "Minute total" },
  en: { exercises: "Exercises", sets: "Sets", volume: "Volume", duration: "Duration", activities: "Activities", minutes: "Total minutes" },
} as const;

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${Math.max(minutes, 1)} min`;
}

function setText(set: { weight: number; reps: number }, options: SummaryOptions) {
  return set.weight > 0
    ? `${options.formatWeight(set.weight)} × ${set.reps}`
    : `${set.reps} ${options.language === "ro" ? "rep." : "reps"}`;
}

function heaviest(sets: readonly { weight: number; reps: number }[]) {
  return sets.reduce((best, set) => (set.weight > best.weight || (set.weight === best.weight && set.reps > best.reps) ? set : best));
}

export function buildWorkoutSummary(input: SummaryInput, options: SummaryOptions): WorkoutSummary {
  const copy = COPY[options.language];
  const dateLabel = new Date(`${input.date}T00:00:00`).toLocaleDateString(options.locale, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const duration = input.durationSec && input.durationSec > 0 ? formatDuration(input.durationSec) : null;

  if (input.mode === "cardio") {
    const minutes = input.cardio.reduce((sum, entry) => sum + entry.durationMin, 0);
    return {
      title: input.title,
      dateLabel,
      stats: [
        { label: copy.activities, value: String(input.cardio.length) },
        { label: copy.minutes, value: `${minutes.toLocaleString(options.locale)} min` },
        ...(duration ? [{ label: copy.duration, value: duration }] : []),
      ],
      exercises: input.cardio.map((entry) => {
        const minutesText = `${entry.durationMin.toLocaleString(options.locale)} min`;
        return { name: cardioName(entry.activity, options.language), sets: [minutesText], hiddenSets: 0, totalSets: 1, top: minutesText, record: false };
      }),
      records: [],
    };
  }

  // Warmups are left out: they would bury the working sets.
  const counted = input.sets.filter((set) => set.setType !== "Warmup");
  const order: string[] = [];
  const byExercise = new Map<string, SummarySet[]>();
  for (const set of counted) {
    if (!byExercise.has(set.exercise)) {
      byExercise.set(set.exercise, []);
      order.push(set.exercise);
    }
    byExercise.get(set.exercise)!.push(set);
  }

  const volume = counted.reduce((sum, set) => sum + set.weight * set.reps, 0);
  const exercises = order.map((id): SummaryExercise => {
    const sets = byExercise.get(id)!;
    return {
      name: exerciseName(id, options.language),
      sets: sets.slice(0, MAX_SETS_PER_EXERCISE).map((set) => setText(set, options)),
      hiddenSets: Math.max(0, sets.length - MAX_SETS_PER_EXERCISE),
      totalSets: sets.length,
      top: setText(heaviest(sets), options),
      record: sets.some((set) => input.recordIds.has(set.id)),
    };
  });

  // Each later PR of an exercise beats the earlier one, so the last flagged set is its record.
  const records = order
    .flatMap((id) => {
      const flagged = byExercise.get(id)!.filter((set) => input.recordIds.has(set.id));
      const best = flagged[flagged.length - 1];
      return best ? [{ name: exerciseName(id, options.language), text: setText(best, options) }] : [];
    });

  return {
    title: input.title,
    dateLabel,
    stats: [
      { label: copy.exercises, value: String(order.length) },
      { label: copy.sets, value: String(counted.length) },
      ...(volume > 0 ? [{ label: copy.volume, value: options.formatWeight(Math.round(volume)) }] : []),
      ...(duration ? [{ label: copy.duration, value: duration }] : []),
    ],
    exercises,
    records,
  };
}
