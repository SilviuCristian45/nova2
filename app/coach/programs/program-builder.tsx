"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Copy,
  Dumbbell,
  Heart,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { Text, useLanguage } from "@/app/components/language-provider";
import { useUnits } from "@/app/components/units-provider";
import { ExerciseCombobox } from "@/app/components/exercise-combobox";
import { workoutLabelText } from "@/app/components/workout-label";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Field,
  IconButton,
  Input,
  Message,
  Segmented,
  Select,
  Textarea,
} from "@/app/components/ui";
import { cardioName } from "@/lib/exercise-catalog";
import {
  CARDIO_ACTIVITIES,
  EXERCISES,
  SET_TYPES,
  SPLITS,
  getExercisesForSplit,
  type Split,
} from "@/lib/workout-data";
import {
  PROGRAM_ACCESS_TYPES,
  PROGRAM_DIFFICULTIES,
  PROGRAM_GOALS,
  PROGRAM_STATUSES,
  normalizeInviteCode,
  type ProgramAccessType,
  type ProgramDifficulty,
  type ProgramGoal,
  type ProgramStatus,
} from "@/lib/coach/types";
import {
  accessTypeLabel,
  difficultyLabel,
  generateInviteCode,
  goalLabel,
  moveItem,
  programStatusLabel,
  type ProgramCardioInput,
  type ProgramExerciseInput,
  type ProgramPayloadInput,
  type ProgramWorkoutInput,
} from "@/lib/coach/programs";
import { deleteProgramAction, saveProgramAction } from "./actions";
import { CopyInviteButton } from "./copy-invite-button";

type DraftExercise = ProgramExerciseInput & { key: string; showAdvanced?: boolean };
type DraftCardio = ProgramCardioInput & { key: string };
type DraftWorkout = Omit<ProgramWorkoutInput, "exercises" | "cardio"> & {
  key: string;
  expanded: boolean;
  exercises: DraftExercise[];
  cardio: DraftCardio[];
};

export type InitialProgramData = ProgramPayloadInput & { id: string };

let keyCounter = 0;
function nextKey(prefix: string) {
  keyCounter += 1;
  return `${prefix}-${keyCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

function defaultExercise(split: string): DraftExercise {
  const list = SPLITS.includes(split as Split) ? getExercisesForSplit(split as Split) : EXERCISES;
  return {
    key: nextKey("ex"),
    exercise: list[0] ?? EXERCISES[0],
    setType: "Working Set",
    targetSets: 3,
    targetRepsMin: 8,
    targetRepsMax: 10,
    targetRir: 2,
    targetWeightKg: null,
    restSeconds: 90,
    notes: "",
    showAdvanced: false,
  };
}

function defaultCardio(): DraftCardio {
  return {
    key: nextKey("cardio"),
    activity: CARDIO_ACTIVITIES[0],
    targetDurationMin: 30,
    notes: "",
  };
}

function createDay(weekNumber: number, dayNumber: number, t: (ro: string, en: string) => string): DraftWorkout {
  return {
    key: nextKey("day"),
    weekNumber,
    dayNumber,
    title: `${t("Ziua", "Day")} ${dayNumber}`,
    workoutMode: "strength",
    split: "Push",
    notes: "",
    expanded: true,
    exercises: [defaultExercise("Push")],
    cardio: [],
  };
}

export function ProgramBuilder({ initial }: { initial: InitialProgramData | null }) {
  const router = useRouter();
  const { t, language } = useLanguage();
  const { unit, toUnit, toKg } = useUnits();

  const [tab, setTab] = useState<"details" | "workouts">(initial ? "workouts" : "details");
  const [weekFilter, setWeekFilter] = useState<number | "all">("all");

  // Program details state
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [difficulty, setDifficulty] = useState<ProgramDifficulty>(initial?.difficulty ?? "intermediate");
  const [durationWeeks, setDurationWeeks] = useState(initial?.durationWeeks ?? 4);
  const [goal, setGoal] = useState<ProgramGoal>(initial?.goal ?? "hypertrophy");
  const [status, setStatus] = useState<ProgramStatus>(initial?.status ?? "draft");
  const [accessType, setAccessType] = useState<ProgramAccessType>(initial?.accessType ?? "public");
  const [requiresApproval, setRequiresApproval] = useState(initial?.requiresApproval ?? false);
  const [inviteCode, setInviteCode] = useState<string>(initial?.inviteCode ?? "");

  // Workouts state
  const [workouts, setWorkouts] = useState<DraftWorkout[]>(() => {
    if (initial && initial.workouts.length > 0) {
      return initial.workouts.map((w, idx) => ({
        ...w,
        key: w.id ?? nextKey("day"),
        expanded: idx === 0,
        exercises: w.exercises.map((ex) => ({
          ...ex,
          key: ex.id ?? nextKey("ex"),
          showAdvanced: Boolean(ex.targetWeightKg || ex.notes || (ex.setType && ex.setType !== "Working Set")),
        })),
        cardio: w.cardio.map((c) => ({ ...c, key: c.id ?? nextKey("cardio") })),
      }));
    }
    return [createDay(1, 1, t)];
  });

  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const weeks = Array.from({ length: Math.max(1, Math.min(52, durationWeeks)) }, (_, i) => i + 1);
  const visibleWorkouts = weekFilter === "all"
    ? workouts
    : workouts.filter((w) => w.weekNumber === weekFilter);

  function updateWorkout(key: string, updater: (w: DraftWorkout) => DraftWorkout) {
    setWorkouts((prev) => prev.map((w) => (w.key === key ? updater(w) : w)));
  }

  function addDay() {
    const targetWeek = weekFilter === "all" ? (workouts[workouts.length - 1]?.weekNumber ?? 1) : weekFilter;
    const daysInWeek = workouts.filter((w) => w.weekNumber === targetWeek);
    const nextDayNum = Math.min(7, daysInWeek.length + 1);
    const next = createDay(targetWeek, nextDayNum, t);
    setWorkouts((prev) => [...prev.map((w) => ({ ...w, expanded: false })), next]);
  }

  function duplicateDay(index: number) {
    const source = workouts[index];
    if (!source) return;
    const copy: DraftWorkout = {
      ...source,
      id: undefined,
      key: nextKey("day"),
      dayNumber: Math.min(7, source.dayNumber + 1),
      title: `${source.title} (${t("copie", "copy")})`.slice(0, 120),
      expanded: true,
      exercises: source.exercises.map((ex) => ({ ...ex, id: undefined, key: nextKey("ex") })),
      cardio: source.cardio.map((c) => ({ ...c, id: undefined, key: nextKey("cardio") })),
    };
    setWorkouts((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }

  function removeDay(key: string) {
    setWorkouts((prev) => prev.filter((w) => w.key !== key));
  }

  function reorderDay(index: number, direction: "up" | "down") {
    setWorkouts((prev) => moveItem(prev, index, direction));
  }

  function addExercise(dayKey: string, split: string) {
    updateWorkout(dayKey, (w) => ({
      ...w,
      exercises: [...w.exercises, defaultExercise(split)],
    }));
  }

  function addCardioItem(dayKey: string) {
    updateWorkout(dayKey, (w) => ({
      ...w,
      cardio: [...w.cardio, defaultCardio()],
    }));
  }

  async function handleSave() {
    setError(null);
    setSavedMessage(null);
    setSaving(true);
    try {
      const payload: ProgramPayloadInput = {
        id: initial?.id,
        title,
        description,
        difficulty,
        durationWeeks,
        goal,
        status,
        accessType,
        requiresApproval,
        inviteCode: inviteCode.trim() ? normalizeInviteCode(inviteCode) : null,
        workouts: workouts.map((w) => ({
          id: w.id,
          weekNumber: Math.min(durationWeeks, Math.max(1, w.weekNumber)),
          dayNumber: Math.min(7, Math.max(1, w.dayNumber)),
          title: w.title,
          workoutMode: w.workoutMode,
          split: w.workoutMode === "cardio" ? "CARDIO" : w.split,
          notes: w.notes,
          exercises: w.workoutMode === "strength"
            ? w.exercises.map((ex) => ({
                id: ex.id,
                exercise: ex.exercise,
                setType: ex.setType,
                targetSets: ex.targetSets,
                targetRepsMin: ex.targetRepsMin,
                targetRepsMax: ex.targetRepsMax,
                targetRir: ex.targetRir,
                targetWeightKg: ex.targetWeightKg,
                restSeconds: ex.restSeconds,
                notes: ex.notes,
              }))
            : [],
          cardio: w.workoutMode === "cardio"
            ? w.cardio.map((c) => ({
                id: c.id,
                activity: c.activity,
                targetDurationMin: c.targetDurationMin,
                notes: c.notes,
              }))
            : [],
        })),
      };

      const result = await saveProgramAction(payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.inviteCode) setInviteCode(result.inviteCode);
      setSavedMessage(t("Program salvat cu succes.", "Program saved successfully."));
      if (!initial?.id && result.programId) {
        router.replace(`/coach/programs/${result.programId}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Eroare la salvare.", "Failed to save."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial?.id) return;
    setDeleting(true);
    setError(null);
    const result = await deleteProgramAction(initial.id);
    if (result.error) {
      setError(result.error);
      setDeleting(false);
      return;
    }
    router.push("/coach/programs");
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <Segmented
        label={t("Secțiune program", "Program section")}
        value={tab}
        onChange={setTab}
        options={[
          { value: "details", label: t("Detalii", "Details") },
          { value: "workouts", label: `${t("Antrenamente", "Workouts")} (${workouts.length})` },
        ]}
      />

      {tab === "details" && (
        <Card>
          <CardTitle
            description={
              <Text
                ro="Configurează informațiile generale, accesul și codul de invitație al programului."
                en="Configure general details, visibility, and invite code."
              />
            }
          >
            <Text ro="Detalii program" en="Program details" />
          </CardTitle>

          <Field label={<Text ro="Titlu program" en="Program title" />} htmlFor="prog-title">
            <Input
              id="prog-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder={t("ex. Upper / Lower Hipertrofie 8 săpt.", "e.g. Upper / Lower Hypertrophy 8 wk")}
            />
          </Field>

          <Field label={<Text ro="Descriere" en="Description" />} htmlFor="prog-desc">
            <Textarea
              id="prog-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              placeholder={t("Pentru cine este programul, echipament necesar, progresie...", "Who it is for, equipment needed, progression...")}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={<Text ro="Obiectiv" en="Goal" />}>
              <Select
                title={t("Obiectiv", "Goal")}
                value={goal}
                onChange={(v) => setGoal(v as ProgramGoal)}
                options={PROGRAM_GOALS.map((g) => ({ value: g, label: goalLabel(g, t) }))}
              />
            </Field>
            <Field label={<Text ro="Dificultate" en="Difficulty" />}>
              <Select
                title={t("Dificultate", "Difficulty")}
                value={difficulty}
                onChange={(v) => setDifficulty(v as ProgramDifficulty)}
                options={PROGRAM_DIFFICULTIES.map((d) => ({ value: d, label: difficultyLabel(d, t) }))}
              />
            </Field>
            <Field label={<Text ro="Durată (săptămâni)" en="Duration (weeks)" />} htmlFor="prog-weeks">
              <Input
                id="prog-weeks"
                type="number"
                inputMode="numeric"
                min={1}
                max={52}
                value={durationWeeks}
                onChange={(e) => setDurationWeeks(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="pl-0.5 text-[13px] font-medium text-muted">
                <Text ro="Status" en="Status" />
              </span>
              <Segmented
                inCard
                label={t("Status", "Status")}
                value={status}
                onChange={setStatus}
                options={PROGRAM_STATUSES.map((s) => ({ value: s, label: programStatusLabel(s, t) }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="pl-0.5 text-[13px] font-medium text-muted">
                <Text ro="Acces" en="Access" />
              </span>
              <Segmented
                inCard
                label={t("Acces", "Access")}
                value={accessType}
                onChange={(next) => {
                  setAccessType(next);
                  if (next === "invite_only" && !inviteCode.trim()) {
                    setInviteCode(generateInviteCode(8));
                  }
                }}
                options={PROGRAM_ACCESS_TYPES.map((a) => ({ value: a, label: accessTypeLabel(a, t) }))}
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 rounded-md bg-inner px-3.5 py-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              className="size-4 accent-[var(--lime)]"
            />
            <Text
              ro="Necesită aprobarea mea înainte ca clientul să devină activ"
              en="Require my approval before the client becomes active"
            />
          </label>

          <div className="flex flex-col gap-2.5 rounded-md bg-inner p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-soft">
                <Text ro="Cod & link de invitație" en="Invite code & link" />
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  small
                  icon={RefreshCw}
                  onClick={() => setInviteCode(generateInviteCode(8))}
                >
                  <Text ro="Generează cod" en="Generate code" />
                </Button>
                {inviteCode.trim().length >= 6 && <CopyInviteButton code={normalizeInviteCode(inviteCode)} />}
              </div>
            </div>
            <Input
              value={inviteCode}
              onChange={(e) => setInviteCode(normalizeInviteCode(e.target.value))}
              maxLength={16}
              placeholder={t("Opțional pentru programe publice (6–16 caractere)", "Optional for public programs (6–16 chars)")}
            />
            <p className="text-xs text-muted">
              <Text
                ro="Link direct: /explore?code=COD — deschide automat previzualizarea programului pentru client."
                en="Direct link: /explore?code=CODE — opens the program preview directly for the client."
              />
            </p>
          </div>
        </Card>
      )}

      {tab === "workouts" && (
        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setWeekFilter("all")}
                  className={`min-h-9 rounded-full px-3 text-xs font-semibold transition-colors ${
                    weekFilter === "all" ? "bg-lime text-on-solid" : "bg-inner text-soft"
                  }`}
                >
                  <Text ro="Toate" en="All" /> ({workouts.length})
                </button>
                {weeks.map((week) => {
                  const count = workouts.filter((w) => w.weekNumber === week).length;
                  return (
                    <button
                      key={week}
                      type="button"
                      onClick={() => setWeekFilter(week)}
                      className={`min-h-9 rounded-full px-3 text-xs font-semibold transition-colors ${
                        weekFilter === week ? "bg-lime text-on-solid" : "bg-inner text-soft"
                      }`}
                    >
                      {t("S", "W")}{week}{count > 0 ? ` · ${count}` : ""}
                    </button>
                  );
                })}
              </div>
              <Button variant="secondary" small icon={Plus} onClick={addDay}>
                <Text ro="Adaugă zi" en="Add day" />
              </Button>
            </div>
          </Card>

          {visibleWorkouts.length === 0 ? (
            <Card>
              <p className="py-4 text-center text-sm text-muted">
                <Text ro="Nicio zi în această săptămână." en="No workout days in this week yet." />
              </p>
              <Button variant="secondary" icon={Plus} onClick={addDay}>
                <Text ro="Adaugă prima zi" en="Add first day" />
              </Button>
            </Card>
          ) : (
            visibleWorkouts.map((day) => {
              const globalIndex = workouts.findIndex((w) => w.key === day.key);
              const splitExercises = SPLITS.includes(day.split as Split)
                ? [...new Set([...getExercisesForSplit(day.split as Split), ...EXERCISES])]
                : EXERCISES;

              return (
                <Card key={day.key} padded={false}>
                  {/* Collapsible Day Header */}
                  <div className="flex items-center gap-2 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => updateWorkout(day.key, (w) => ({ ...w, expanded: !w.expanded }))}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <Badge tone={day.workoutMode === "cardio" ? "coral" : "lime"}>
                        {t("S", "W")}{day.weekNumber}·{t("Z", "D")}{day.dayNumber}
                      </Badge>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-semibold">{day.title || t("Zi fără titlu", "Untitled day")}</span>
                        <span className="text-xs text-muted">
                          {day.workoutMode === "cardio"
                            ? `Cardio · ${day.cardio.length} ${t("activități", "activities")}`
                            : `${workoutLabelText(day.split, t)} · ${day.exercises.length} ${t("exerciții", "exercises")}`}
                        </span>
                      </span>
                      {day.expanded ? <ChevronUp className="size-4 text-muted" /> : <ChevronDown className="size-4 text-muted" />}
                    </button>

                    <div className="flex items-center gap-0.5">
                      <IconButton
                        icon={ArrowUp}
                        plain
                        disabled={globalIndex <= 0}
                        label={t("Mută ziua sus", "Move day up")}
                        onClick={() => reorderDay(globalIndex, "up")}
                      />
                      <IconButton
                        icon={ArrowDown}
                        plain
                        disabled={globalIndex >= workouts.length - 1}
                        label={t("Mută ziua jos", "Move day down")}
                        onClick={() => reorderDay(globalIndex, "down")}
                      />
                      <IconButton
                        icon={Copy}
                        plain
                        label={t("Duplică ziua", "Duplicate day")}
                        onClick={() => duplicateDay(globalIndex)}
                      />
                      <IconButton
                        icon={Trash2}
                        plain
                        tone="red"
                        label={t("Șterge ziua", "Delete day")}
                        onClick={() => removeDay(day.key)}
                      />
                    </div>
                  </div>

                  {day.expanded && (
                    <div className="flex flex-col gap-3.5 border-t border-line px-4 pb-4 pt-3.5">
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
                        <Field label={<Text ro="Titlu zi" en="Day title" />} className="sm:col-span-2">
                          <Input
                            value={day.title}
                            maxLength={120}
                            onChange={(e) => updateWorkout(day.key, (w) => ({ ...w, title: e.target.value }))}
                            placeholder={t("ex. Push A", "e.g. Push A")}
                          />
                        </Field>
                        <Field label={<Text ro="Săptămâna" en="Week" />}>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={durationWeeks}
                            center
                            value={day.weekNumber}
                            onChange={(e) =>
                              updateWorkout(day.key, (w) => ({
                                ...w,
                                weekNumber: Math.max(1, Math.min(durationWeeks, Number(e.target.value) || 1)),
                              }))
                            }
                          />
                        </Field>
                        <Field label={<Text ro="Ziua (1–7)" en="Day (1–7)" />}>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={7}
                            center
                            value={day.dayNumber}
                            onChange={(e) =>
                              updateWorkout(day.key, (w) => ({
                                ...w,
                                dayNumber: Math.max(1, Math.min(7, Number(e.target.value) || 1)),
                              }))
                            }
                          />
                        </Field>
                      </div>

                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                          <span className="pl-0.5 text-[13px] font-medium text-muted">
                            <Text ro="Tip" en="Mode" />
                          </span>
                          <Segmented
                            inCard
                            label={t("Tip antrenament", "Workout mode")}
                            value={day.workoutMode}
                            onChange={(nextMode) =>
                              updateWorkout(day.key, (w) => ({
                                ...w,
                                workoutMode: nextMode,
                                split: nextMode === "cardio" ? "CARDIO" : (w.split === "CARDIO" ? "Push" : w.split),
                                exercises: nextMode === "strength" && w.exercises.length === 0 ? [defaultExercise("Push")] : w.exercises,
                                cardio: nextMode === "cardio" && w.cardio.length === 0 ? [defaultCardio()] : w.cardio,
                              }))
                            }
                            options={[
                              { value: "strength", label: t("Forță", "Strength"), icon: Dumbbell },
                              { value: "cardio", label: "Cardio", icon: Heart },
                            ]}
                          />
                        </div>

                        {day.workoutMode === "strength" && (
                          <Field label={<Text ro="Split" en="Split" />}>
                            <Select
                              title={t("Split", "Split")}
                              value={day.split}
                              onChange={(v) => updateWorkout(day.key, (w) => ({ ...w, split: v }))}
                              options={SPLITS.map((s) => ({ value: s, label: workoutLabelText(s, t) }))}
                            />
                          </Field>
                        )}
                      </div>

                      <Field label={<Text ro="Indicații sesiune (opțional)" en="Session notes (optional)" />}>
                        <Input
                          value={day.notes}
                          maxLength={1000}
                          onChange={(e) => updateWorkout(day.key, (w) => ({ ...w, notes: e.target.value }))}
                          placeholder={t("Încălzire 5 min, tempo controlat...", "5 min warmup, controlled tempo...")}
                        />
                      </Field>

                      {day.workoutMode === "strength" ? (
                        <div className="flex flex-col gap-2.5">
                          <span className="pl-0.5 text-[13px] font-semibold text-soft">
                            <Text ro="Exerciții & Ținte" en="Exercises & Targets" />
                          </span>
                          {day.exercises.map((ex, exIndex) => (
                            <div key={ex.key} className="flex flex-col gap-2.5 rounded-md bg-inner p-3">
                              <div className="flex items-center justify-between gap-2">
                                <Badge>#{exIndex + 1}</Badge>
                                <div className="flex items-center gap-0.5">
                                  <IconButton
                                    icon={ArrowUp}
                                    plain
                                    disabled={exIndex <= 0}
                                    label={t("Mută exercițiul sus", "Move exercise up")}
                                    onClick={() =>
                                      updateWorkout(day.key, (w) => ({
                                        ...w,
                                        exercises: moveItem(w.exercises, exIndex, "up"),
                                      }))
                                    }
                                  />
                                  <IconButton
                                    icon={ArrowDown}
                                    plain
                                    disabled={exIndex >= day.exercises.length - 1}
                                    label={t("Mută exercițiul jos", "Move exercise down")}
                                    onClick={() =>
                                      updateWorkout(day.key, (w) => ({
                                        ...w,
                                        exercises: moveItem(w.exercises, exIndex, "down"),
                                      }))
                                    }
                                  />
                                  <IconButton
                                    icon={Trash2}
                                    plain
                                    tone="red"
                                    label={t("Șterge exercițiul", "Remove exercise")}
                                    onClick={() =>
                                      updateWorkout(day.key, (w) => ({
                                        ...w,
                                        exercises: w.exercises.filter((item) => item.key !== ex.key),
                                      }))
                                    }
                                  />
                                </div>
                              </div>

                              <ExerciseCombobox
                                exercises={splitExercises}
                                value={ex.exercise}
                                onChange={(nextEx) =>
                                  updateWorkout(day.key, (w) => ({
                                    ...w,
                                    exercises: w.exercises.map((item) =>
                                      item.key === ex.key ? { ...item, exercise: nextEx } : item,
                                    ),
                                  }))
                                }
                              />

                              <div className="grid grid-cols-4 gap-2">
                                <Field label={<Text ro="Seturi" en="Sets" />}>
                                  <Input
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={50}
                                    center
                                    compact
                                    value={ex.targetSets}
                                    onChange={(e) =>
                                      updateWorkout(day.key, (w) => ({
                                        ...w,
                                        exercises: w.exercises.map((item) =>
                                          item.key === ex.key
                                            ? { ...item, targetSets: Math.max(1, Number(e.target.value) || 1) }
                                            : item,
                                        ),
                                      }))
                                    }
                                  />
                                </Field>
                                <Field label={<Text ro="Rep min" en="Min" />}>
                                  <Input
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={1000}
                                    center
                                    compact
                                    value={ex.targetRepsMin}
                                    onChange={(e) => {
                                      const val = Math.max(1, Number(e.target.value) || 1);
                                      updateWorkout(day.key, (w) => ({
                                        ...w,
                                        exercises: w.exercises.map((item) =>
                                          item.key === ex.key
                                            ? { ...item, targetRepsMin: val, targetRepsMax: Math.max(val, item.targetRepsMax) }
                                            : item,
                                        ),
                                      }));
                                    }}
                                  />
                                </Field>
                                <Field label={<Text ro="Rep max" en="Max" />}>
                                  <Input
                                    type="number"
                                    inputMode="numeric"
                                    min={ex.targetRepsMin}
                                    max={1000}
                                    center
                                    compact
                                    value={ex.targetRepsMax}
                                    onChange={(e) =>
                                      updateWorkout(day.key, (w) => ({
                                        ...w,
                                        exercises: w.exercises.map((item) =>
                                          item.key === ex.key
                                            ? { ...item, targetRepsMax: Math.max(item.targetRepsMin, Number(e.target.value) || item.targetRepsMin) }
                                            : item,
                                        ),
                                      }))
                                    }
                                  />
                                </Field>
                                <Field label="RIR">
                                  <Input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    max={5}
                                    center
                                    compact
                                    placeholder="–"
                                    value={ex.targetRir ?? ""}
                                    onChange={(e) =>
                                      updateWorkout(day.key, (w) => ({
                                        ...w,
                                        exercises: w.exercises.map((item) =>
                                          item.key === ex.key
                                            ? { ...item, targetRir: e.target.value === "" ? null : Math.max(0, Math.min(5, Number(e.target.value))) }
                                            : item,
                                        ),
                                      }))
                                    }
                                  />
                                </Field>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  updateWorkout(day.key, (w) => ({
                                    ...w,
                                    exercises: w.exercises.map((item) =>
                                      item.key === ex.key ? { ...item, showAdvanced: !item.showAdvanced } : item,
                                    ),
                                  }))
                                }
                                className="w-fit text-xs font-semibold text-soft"
                              >
                                {ex.showAdvanced
                                  ? t("Ascunde detalii opționale", "Hide optional details")
                                  : t("+ Greutate țintă, pauză, notiță", "+ Target weight, rest, note")}
                              </button>

                              {ex.showAdvanced && (
                                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                                  <Field label={<Text ro="Tip set" en="Set type" />}>
                                    <Select
                                      title={t("Tip set", "Set type")}
                                      value={ex.setType}
                                      onChange={(v) =>
                                        updateWorkout(day.key, (w) => ({
                                          ...w,
                                          exercises: w.exercises.map((item) =>
                                            item.key === ex.key ? { ...item, setType: v } : item,
                                          ),
                                        }))
                                      }
                                      options={SET_TYPES.map((st) => ({ value: st, label: workoutLabelText(st, t) }))}
                                    />
                                  </Field>
                                  <Field label={`${t("Greutate țintă", "Target weight")} (${unit})`}>
                                    <Input
                                      type="number"
                                      inputMode="decimal"
                                      step="0.5"
                                      min={0}
                                      placeholder="–"
                                      value={ex.targetWeightKg === null ? "" : Number(toUnit(ex.targetWeightKg).toFixed(1))}
                                      onChange={(e) =>
                                        updateWorkout(day.key, (w) => ({
                                          ...w,
                                          exercises: w.exercises.map((item) =>
                                            item.key === ex.key
                                              ? { ...item, targetWeightKg: e.target.value === "" ? null : toKg(Number(e.target.value)) }
                                              : item,
                                          ),
                                        }))
                                      }
                                    />
                                  </Field>
                                  <Field label={<Text ro="Pauză (sec)" en="Rest (sec)" />}>
                                    <Input
                                      type="number"
                                      inputMode="numeric"
                                      min={10}
                                      max={900}
                                      placeholder="90"
                                      value={ex.restSeconds ?? ""}
                                      onChange={(e) =>
                                        updateWorkout(day.key, (w) => ({
                                          ...w,
                                          exercises: w.exercises.map((item) =>
                                            item.key === ex.key
                                              ? { ...item, restSeconds: e.target.value === "" ? null : Number(e.target.value) }
                                              : item,
                                          ),
                                        }))
                                      }
                                    />
                                  </Field>
                                  <Field label={<Text ro="Notiță exercițiu" en="Exercise note" />} className="sm:col-span-3">
                                    <Input
                                      value={ex.notes}
                                      maxLength={280}
                                      onChange={(e) =>
                                        updateWorkout(day.key, (w) => ({
                                          ...w,
                                          exercises: w.exercises.map((item) =>
                                            item.key === ex.key ? { ...item, notes: e.target.value } : item,
                                          ),
                                        }))
                                      }
                                      placeholder={t("Pauză 1s jos, coatele la 45°...", "1s pause at bottom, elbows at 45°...")}
                                    />
                                  </Field>
                                </div>
                              )}
                            </div>
                          ))}

                          <Button variant="secondary" small icon={Plus} onClick={() => addExercise(day.key, day.split)}>
                            <Text ro="Adaugă exercițiu" en="Add exercise" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2.5">
                          <span className="pl-0.5 text-[13px] font-semibold text-soft">
                            <Text ro="Activități cardio" en="Cardio activities" />
                          </span>
                          {day.cardio.map((c, cIndex) => (
                            <div key={c.key} className="flex flex-col gap-2.5 rounded-md bg-inner p-3">
                              <div className="flex items-center justify-between gap-2">
                                <Badge tone="coral">#{cIndex + 1}</Badge>
                                <div className="flex items-center gap-0.5">
                                  <IconButton
                                    icon={ArrowUp}
                                    plain
                                    disabled={cIndex <= 0}
                                    label={t("Mută sus", "Move up")}
                                    onClick={() =>
                                      updateWorkout(day.key, (w) => ({
                                        ...w,
                                        cardio: moveItem(w.cardio, cIndex, "up"),
                                      }))
                                    }
                                  />
                                  <IconButton
                                    icon={ArrowDown}
                                    plain
                                    disabled={cIndex >= day.cardio.length - 1}
                                    label={t("Mută jos", "Move down")}
                                    onClick={() =>
                                      updateWorkout(day.key, (w) => ({
                                        ...w,
                                        cardio: moveItem(w.cardio, cIndex, "down"),
                                      }))
                                    }
                                  />
                                  <IconButton
                                    icon={Trash2}
                                    plain
                                    tone="red"
                                    label={t("Șterge", "Remove")}
                                    onClick={() =>
                                      updateWorkout(day.key, (w) => ({
                                        ...w,
                                        cardio: w.cardio.filter((item) => item.key !== c.key),
                                      }))
                                    }
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                                <Field label={<Text ro="Activitate" en="Activity" />} className="sm:col-span-2">
                                  <Select
                                    title={t("Activitate", "Activity")}
                                    value={c.activity}
                                    onChange={(v) =>
                                      updateWorkout(day.key, (w) => ({
                                        ...w,
                                        cardio: w.cardio.map((item) =>
                                          item.key === c.key ? { ...item, activity: v } : item,
                                        ),
                                      }))
                                    }
                                    options={CARDIO_ACTIVITIES.map((act) => ({ value: act, label: cardioName(act, language) }))}
                                  />
                                </Field>
                                <Field label={<Text ro="Durată (min)" en="Duration (min)" />}>
                                  <Input
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={1440}
                                    center
                                    value={c.targetDurationMin}
                                    onChange={(e) =>
                                      updateWorkout(day.key, (w) => ({
                                        ...w,
                                        cardio: w.cardio.map((item) =>
                                          item.key === c.key
                                            ? { ...item, targetDurationMin: Math.max(1, Number(e.target.value) || 1) }
                                            : item,
                                        ),
                                      }))
                                    }
                                  />
                                </Field>
                              </div>
                              <Field label={<Text ro="Notiță (opțional)" en="Note (optional)" />}>
                                <Input
                                  value={c.notes}
                                  maxLength={280}
                                  onChange={(e) =>
                                    updateWorkout(day.key, (w) => ({
                                      ...w,
                                      cardio: w.cardio.map((item) =>
                                        item.key === c.key ? { ...item, notes: e.target.value } : item,
                                      ),
                                    }))
                                  }
                                  placeholder={t("Zonă 2 puls, înclinație 8%...", "Zone 2 HR, 8% incline...")}
                                />
                              </Field>
                            </div>
                          ))}
                          <Button variant="secondary" small icon={Plus} onClick={() => addCardioItem(day.key)}>
                            <Text ro="Adaugă activitate cardio" en="Add cardio activity" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}

      {error && <Message>{error}</Message>}
      {savedMessage && <Message tone="lime">{savedMessage}</Message>}

      <div className="flex flex-col gap-3">
        <Button large icon={Save} busy={saving} onClick={handleSave}>
          {initial ? (
            <Text ro="Salvează modificările" en="Save changes" />
          ) : (
            <Text ro="Creează programul" en="Create program" />
          )}
        </Button>

        {initial && !confirmDelete && (
          <Button variant="soft" tone="red" icon={Trash2} onClick={() => setConfirmDelete(true)}>
            <Text ro="Șterge programul" en="Delete program" />
          </Button>
        )}

        {initial && confirmDelete && (
          <Card tone="red">
            <p className="text-sm font-semibold">
              <Text
                ro="Sigur vrei să ștergi acest program? Antrenamentele deja logate de clienți rămân în istoricul lor."
                en="Delete this program? Workouts already logged by clients stay in their history."
              />
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" busy={deleting} onClick={handleDelete}>
                <Text ro="Confirmă ștergerea" en="Confirm delete" />
              </Button>
              <Button variant="secondary" disabled={deleting} onClick={() => setConfirmDelete(false)}>
                <Text ro="Anulează" en="Cancel" />
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
