"use client";

import { Text, useLanguage } from "@/app/components/language-provider";
import { workoutLabelText } from "@/app/components/workout-label";
import { WorkoutSummaryDialog } from "@/app/components/workout-summary-dialog";
import type { SummaryInput } from "@/lib/workout-summary";
import { useEffect, useMemo, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Dumbbell,
  Heart,
  Plus,
  Save,
  Trophy,
  Play,
  Pause,
  Square,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import confetti from "canvas-confetti";

import { saveWorkout } from "./action";
import {
  SPLITS,
  SET_TYPES,
  CARDIO_ACTIVITIES,
  type Split,
  type SetType,
  getExercisesForSplit,
} from "@/lib/workout-data";
import type { OfflineCardio, OfflineSet } from "@/lib/offline/types";
import { saveOfflineMutation, useOffline } from "@/lib/offline/client";
import { useUnits } from "@/app/components/units-provider";
import { progressionStepKg } from "@/lib/units";
import { RestTimerBar, RestTimerSettings, useRestTimer } from "@/app/components/rest-timer";
import { localDate } from "@/lib/daily-metrics";
import { readOfflineDatabase } from "@/lib/offline/store";
import {
  calculateProgression,
  getBestSetFromLastSession,
} from "@/utils/fitness";
import { createSubmitGuard, runGuarded } from "@/lib/submit-guard";
import { draftPersonalRecords, type BestSet } from "@/lib/personal-record";
import { restoreDraft, type DraftState } from "@/lib/workout-draft";
import { idleTimer, pauseTimer as pauseTimerState, startTimer as startTimerState, timerSeconds, type TimerState } from "@/lib/workout-timer";
import { displayOrdinals, positionSetNumbers } from "@/lib/set-numbering";
import { workoutSplit } from "@/lib/workout-save";
import { ExerciseCombobox } from "@/app/components/exercise-combobox";
import { localizeOfflineMessage } from "@/lib/offline/messages";
import { fetchRecentSets, fetchRecordBaseline } from "@/lib/exercise-history";
import {
  cardioName,
} from "@/lib/exercise-catalog";
import { CardioRows, SetRows } from "@/app/components/workout-parts";
import { Button, Card, Field, IconButton, Input, Message, Screen, Segmented, Select } from "@/app/components/ui";

const DRAFT_KEY = "workout_draft_v1";

export default function InsertWorkoutPage() {
  const { t, language } = useLanguage();
  const { ownerId, ready, sync } = useOffline();
  const { unit, toUnit, toKg, format } = useUnits();
  const restTimer = useRestTimer();
  const draftKey = ownerId ? `${DRAFT_KEY}_${ownerId}` : null;
  const [loadedDraftKey, setLoadedDraftKey] = useState<string | null>(null);

  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>("");
  // Set once the workout is saved: the shareable card is shown before leaving the page.
  const submitGuard = useRef(createSubmitGuard());
  const [saveLocked, setSaveLocked] = useState(false);
  const [finished, setFinished] = useState<{ input: SummaryInput; next: string } | null>(null);

  // State general
  const [mode, setMode] = useState<"strength" | "cardio">("strength");
  const [sessionSets, setSessionSets] = useState<
    (OfflineSet & { id: string })[]
  >([]);
  const [cardioEntries, setCardioEntries] = useState<
    (OfflineCardio & { id: string })[]
  >([]);

  // Formular Strength
  const [split, setSplit] = useState<Split>("Push");
  const [availableExercises, setAvailableExercises] = useState<string[]>(
    getExercisesForSplit("Push"),
  );
  const [exercise, setExercise] = useState(availableExercises[0]);
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [rir, setRir] = useState("");
  const [setType, setSetType] = useState<SetType>("Working Set");

  const [lastPerformance, setLastPerformance] = useState<string | null>(null);

  // Formular Cardio
  const [cardioActivity, setCardioActivity] = useState(CARDIO_ACTIVITIES[0]);
  const [cardioDuration, setCardioDuration] = useState("");

  // --- STATE PENTRU TIMER ---
  // Computed from timestamps (see lib/workout-timer.ts) and kept in the draft; `now` only triggers re-renders.
  const [timer, setTimer] = useState<TimerState>(idleTimer);
  const [now, setNow] = useState(() => Date.now());
  const isRunning = timer.startedAt !== null;
  const time = timerSeconds(timer, now);

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  const startTimer = () => {
    const at = Date.now();
    setNow(at);
    setTimer((current) => startTimerState(current, at));
  };

  const pauseTimer = () => {
    const at = Date.now();
    setNow(at);
    setTimer((current) => pauseTimerState(current, at));
  };

  const resetTimer = () => setTimer(idleTimer);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };
  // --------------------------

  // Reset exerciții la schimbarea split-ului
  useEffect(() => {
    const newExercises = getExercisesForSplit(split);
    setAvailableExercises(newExercises);
    setExercise(newExercises[0]);
  }, [split]);

  // Best set of the last session per exercise, from before this workout: the PR baseline.
  const [baselines, setBaselines] = useState<Record<string, BestSet | null>>({});
  const requestedBaselines = useRef(new Set<string>());

  const [recommendedPerformance, setRecommendedPerformance] = useState("");
  const [recommendedIsNew, setRecommendedIsNew] = useState(false);

  // Fetch ultima performanță
  useEffect(() => {
    if (mode !== "strength" || !exercise) return;

    async function fetchLastPerformance() {
      setLastPerformance(t("Se caută istoricul...", "Loading history..."));
      setRecommendedIsNew(false);
      setRecommendedPerformance(
        t(
          "Va recomandam greutatea de lucru si repetarile",
          "We recommend you work set lift data",
        ),
      );
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      let data: Awaited<ReturnType<typeof fetchRecentSets>> = [];
      let recordBaseline: BestSet | null = null;
      let error = false;
      try {
        [data, recordBaseline] = await Promise.all([
          fetchRecentSets(supabase, user.id, exercise),
          fetchRecordBaseline(supabase, user.id, exercise),
        ]);
      } catch (e) {
        console.error("Exercise history could not be loaded:", e);
        error = true;
      }

      if (error || data.length === 0) {
        setLastPerformance(
          t(
            "Exercițiu nou. Setează primul record!",
            "New exercise. Set your first record!",
          ),
        );
        requestedBaselines.current.add(exercise);
        setBaselines((prev) => ({ ...prev, [exercise]: null }));
        return;
      }

      // Folosim funcția separată ca să extragem cel mai bun set din ultima sesiune
      const bestSet = getBestSetFromLastSession(data);

      if (!bestSet) {
        setLastPerformance(
          t(
            "Exercițiu nou. Setează primul record!",
            "New exercise. Set your first record!",
          ),
        );
        requestedBaselines.current.add(exercise);
        setBaselines((prev) => ({ ...prev, [exercise]: null }));
        return;
      }

      const weightText =
        Number(bestSet.weight) > 0 ? `${format(Number(bestSet.weight))} × ` : "";
      const notesText = bestSet.notes ? ` (${bestSet.notes})` : "";

      requestedBaselines.current.add(exercise);
      setBaselines((prev) => ({ ...prev, [exercise]: recordBaseline }));

      setLastPerformance(
        `${t("Ultima oară ai făcut", "Last time you did")}: ${weightText}${bestSet.reps} ${t("repetări", "reps")} ${bestSet.rir === null || bestSet.rir === undefined ? "" : ` (RIR ${bestSet.rir})`}${notesText}`,
      );

      const recommendation = calculateProgression(bestSet, format, progressionStepKg(unit), t);
      setRecommendedPerformance(recommendation.message);
      setRecommendedIsNew(recommendation.kind === "new");
    }

    fetchLastPerformance();
  }, [exercise, mode, t, format, unit]);

  // Restored drafts can hold exercises that were never selected in this visit: load their baselines too.
  const draftExercises = useMemo(
    () => [...new Set(sessionSets.map((s) => s.exercise))],
    [sessionSets],
  );
  useEffect(() => {
    const missing = draftExercises.filter((name) => !requestedBaselines.current.has(name));
    if (missing.length === 0) return;
    missing.forEach((name) => requestedBaselines.current.add(name));
    async function loadMissing() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const loaded: Record<string, BestSet | null> = {};
      for (const name of missing) {
        loaded[name] = user ? await fetchRecordBaseline(supabase, user.id, name) : null;
      }
      setBaselines((prev) => ({ ...loaded, ...prev }));
    }
    void loadMissing().catch((error) => {
      console.error("Personal record baselines could not be loaded:", error);
      setBaselines((prev) => ({ ...Object.fromEntries(missing.map((name) => [name, null])), ...prev }));
    });
  }, [draftExercises]);

  // Shown numbers: 1, 2, 3... within each exercise (the stored number is the position in the workout).
  const ordinals = useMemo(
    () => displayOrdinals(sessionSets.map((s, index) => ({ exercise: s.exercise, order: index }))),
    [sessionSets],
  );

  // Derived from the current list, so deleting a set re-evaluates every PR after it.
  const personalRecords = useMemo(
    () => draftPersonalRecords(sessionSets, baselines),
    [sessionSets, baselines],
  );

  // Read by the restore effect, which must not run again whenever the sets change.
  const latestDraft = useRef<
    DraftState<(typeof sessionSets)[number], (typeof cardioEntries)[number]>
  >({ sets: [], cardio: [], mode: "strength", timer: idleTimer });
  useEffect(() => {
    latestDraft.current = { sets: sessionSets, cardio: cardioEntries, mode, timer };
  }, [sessionSets, cardioEntries, mode, timer]);

  // Local Storage
  useEffect(() => {
    if (!draftKey) return;
    const key = draftKey;
    let cancelled = false;
    async function restore() {
      try {
        const state = await readOfflineDatabase();
        if (cancelled || state.activeOwner !== ownerId) return;
        const restored = restoreDraft(
          latestDraft.current,
          localStorage.getItem(key),
        );
        setSessionSets(restored.sets);
        setCardioEntries(restored.cardio);
        setMode(restored.mode);
        setTimer(restored.timer);
        setNow(Date.now());
        setLoadedDraftKey(key);
      } catch (error) {
        console.error("Workout draft could not be loaded:", error);
        if (!cancelled)
          setError(
            t("Ciorna nu a putut fi încărcată.", "Workout draft could not be loaded."),
          );
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, [draftKey, ownerId, t]);

  useEffect(() => {
    if (!draftKey || loadedDraftKey !== draftKey) return;
    const key = draftKey;
    let cancelled = false;
    async function persist() {
      try {
        const state = await readOfflineDatabase();
        if (cancelled || state.activeOwner !== ownerId) return;
        if (
          sessionSets.length ||
          cardioEntries.length ||
          timer.startedAt !== null ||
          timer.elapsedMs > 0
        )
          localStorage.setItem(
            key,
            JSON.stringify({ sets: sessionSets, cardio: cardioEntries, mode, timer }),
          );
        else localStorage.removeItem(key);
      } catch (error) {
        console.error("Workout draft could not be stored:", error);
        if (!cancelled)
          setError(
            t(
              "Ciorna nu a putut fi salvată pe dispozitiv.",
              "The workout draft could not be saved on this device.",
            ),
          );
      }
    }
    void persist();
    return () => {
      cancelled = true;
    };
  }, [sessionSets, cardioEntries, mode, timer, draftKey, loadedDraftKey, ownerId, t]);

  // Handler Adăugare Set
  function handleAddSet(e: React.FormEvent) {
    e.preventDefault();
    if (!exercise || reps === "") return;

    const newSet = {
      id: Math.random().toString(36).substring(2, 9),
      split,
      exercise,
      setNumber: sessionSets.length + 1, // position in the workout; the user sees the number within the exercise
      reps: Number(reps),
      weight: weight === "" ? 0 : toKg(Number(weight)),
      rir: rir === "" ? null : Number(rir), // optional: empty means "not recorded", not 0
      setType,
      notes: notes.trim(),
    };

    const isPersonalRecord = draftPersonalRecords(
      [...sessionSets, newSet],
      baselines,
    ).has(newSet.id);

    if (isPersonalRecord) {
      confetti({
        particleCount: 50,
        spread: 80,
        origin: { y: 0.6 },
        colors: ["#c8f031", "#e2ff7a", "#9fc21f"], // lime, the record colour
        zIndex: 100,
        disableForReducedMotion: true,
      });
    }

    setSessionSets((prev) => [...prev, newSet]);
    restTimer.start();
    setReps("");
    setRir("");
    setNotes("");
  }

  function handleAddCardio(e: React.FormEvent) {
    e.preventDefault();
    if (!cardioActivity || cardioDuration === "") return;
    const newEntry = {
      id: Math.random().toString(36).substring(2, 9),
      activity: cardioActivity,
      durationMin: Number(cardioDuration),
    };
    setCardioEntries((prev) => [...prev, newEntry]);
    setCardioDuration("");
  }

  function handleFinish() {
    if (mode === "strength" && sessionSets.length === 0) return;
    if (mode === "cardio" && cardioEntries.length === 0) return;
    if (submitGuard.current.busy) return;

    setError(null);
    restTimer.skip();
    // The split of the logged sets, not whatever the picker shows now (like /offline).
    const savedSplit = workoutSplit(sessionSets, split);
    const summaryInput: SummaryInput = {
      date: localDate(),
      mode,
      title: mode === "cardio" ? "Cardio" : workoutLabelText(savedSplit, t),
      durationSec: time > 0 ? time : null,
      sets: mode === "strength" ? sessionSets : [],
      cardio: mode === "cardio" ? cardioEntries : [],
      recordIds: personalRecords,
    };
    const celebrate = (next = "/") => {
      const duration = 2000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 5,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          disableForReducedMotion: true,
          colors: ["#c8f031", "#ffc233", "#7cc4ff"],
        });
        confetti({
          particleCount: 5,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          disableForReducedMotion: true,
          colors: ["#c8f031", "#ffc233", "#7cc4ff"],
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();

      setTimeout(() => {
        setFinished({ input: summaryInput, next });
      }, 1500);
    };
    startSaving(async () => {
      // True once the workout is stored (saved or queued); false leaves the button free for a retry.
      const outcome = await runGuarded(submitGuard.current, async () => {
        setSaveLocked(true);
        try {
          if (ownerId) {
            let mutationId: string | null = null;
            try {
              mutationId = await saveOfflineMutation(
                {
                  kind: "workout",
                  date: localDate(),
                  mode,
                  split: savedSplit,
                  sets: mode === "strength" ? positionSetNumbers(sessionSets) : [],
                  cardio: mode === "cardio" ? cardioEntries : [],
                },
                ownerId,
              );
              try {
                if (draftKey) localStorage.removeItem(draftKey);
              } catch (error) {
                console.error("Saved workout draft could not be removed:", error);
              }
              // Online: upload right away so the server dashboard already shows the workout.
              // Offline or failed upload: the workout waits in the queue and only the local dashboard has it.
              if (navigator.onLine) {
                await sync();
                const state = await readOfflineDatabase();
                if (!state.accounts[ownerId]?.queue.some((entry) => entry.id === mutationId)) {
                  celebrate();
                  return true;
                }
              }
              celebrate("/offline");
              return true;
            } catch (error) {
              // Already queued: retrying would store the workout twice, so it counts as saved.
              if (mutationId) {
                celebrate("/offline");
                return true;
              }
              setError(
                error instanceof Error
                  ? localizeOfflineMessage(error.message, t)
                  : t("Salvarea a eșuat.", "Save failed."),
              );
              return false;
            }
          }
          const result = await saveWorkout(
            mode,
            savedSplit,
            localDate(),
            positionSetNumbers(sessionSets),
            cardioEntries,
          );

          if (result.error) {
            setError(result.error);
            return false;
          }

          if (draftKey) localStorage.removeItem(draftKey);
          celebrate();
          return true;
        } catch (error) {
          setError(
            error instanceof Error
              ? localizeOfflineMessage(error.message, t)
              : t("Salvarea a eșuat.", "Save failed."),
          );
          return false;
        }
      });
      // Failure unlocks the button; success stays locked until the summary is closed and the page changes.
      if (outcome === "failed") setSaveLocked(false);
    });
  }

  const latestRecord = [...sessionSets]
    .reverse()
    .find((s) => s.exercise === exercise && personalRecords.has(s.id));
  const exerciseHint = latestRecord
    ? `${t("Nou record", "New record")}: ${latestRecord.weight > 0 ? `${format(latestRecord.weight)} × ` : ""}${latestRecord.reps} ${t("repetări", "reps")} ${latestRecord.rir === null ? "" : ` (RIR ${latestRecord.rir})`}${latestRecord.notes ? ` (${latestRecord.notes})` : ""}`
    : lastPerformance;

  if (!ready || (ownerId && loadedDraftKey !== draftKey && !error)) {
    return (
      <Screen title={t("Antrenament nou", "New workout")}>
        <p role="status" className="text-muted">
          {t("Se încarcă jurnalul local...", "Loading local log...")}
        </p>
      </Screen>
    );
  }

  const hasEntries = (mode === "strength" && sessionSets.length > 0) || (mode === "cardio" && cardioEntries.length > 0);

  return (
    <Screen title={t("Antrenament nou", "New workout")} className={restTimer.running || restTimer.finished ? "pb-32" : ""}>
      <Segmented
        label={t("Tip de antrenament", "Workout mode")}
        value={mode}
        onChange={setMode}
        options={[
          { value: "strength", label: t("Forță", "Strength"), icon: Dumbbell },
          { value: "cardio", label: "Cardio", icon: Heart },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start lg:gap-5">
      <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
      {/* Workout timer */}
      <section className="flex items-center justify-between gap-3 rounded-lg bg-card px-[18px] py-3.5">
        <div className="flex flex-col">
          <span className="text-[13px] font-medium text-muted"><Text ro="Cronometru" en="Timer" /></span>
          <span className={`text-[32px] font-bold leading-tight tracking-[-1px] tabular-nums ${isRunning ? "text-lime-text" : ""}`}>
            {formatTime(time)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isRunning ? (
            <IconButton icon={Play} tone="lime" label={t("Pornește cronometrul", "Start timer")} onClick={startTimer} />
          ) : (
            <IconButton icon={Pause} tone="gold" label={t("Pauză cronometru", "Pause timer")} onClick={pauseTimer} />
          )}
          <IconButton icon={Square} label={t("Resetează cronometrul", "Reset timer")} onClick={resetTimer} />
        </div>
      </section>

      {mode === "strength" && (
        <form onSubmit={handleAddSet}>
          <Card>
            <Field label={<Text ro="Împărțire" en="Split" />}>
              <Select
                title={t("Împărțire", "Split")}
                value={split}
                onChange={(value) => setSplit(value as Split)}
                options={SPLITS.map((s) => ({ value: s, label: workoutLabelText(s, t) }))}
              />
            </Field>

            <div className="flex flex-col gap-2">
              <ExerciseCombobox key={split} exercises={availableExercises} value={exercise} onChange={setExercise} />
              {exerciseHint && (
                <p className={`flex w-fit items-center gap-1.5 rounded-sm px-3 py-1.5 text-[13px] font-semibold ${
                  exerciseHint.includes(t("Exercițiu nou", "New exercise")) ? "bg-inner text-muted" : "bg-lime-soft text-lime-text"}`}>
                  {latestRecord && <Trophy className="size-3.5 shrink-0" />}
                  {exerciseHint}
                </p>
              )}
              {recommendedPerformance && (
                <p className={`flex w-fit items-center gap-1.5 rounded-sm px-3 py-1.5 text-[13px] font-semibold ${
                  recommendedIsNew ? "bg-inner text-muted" : "bg-lime-soft text-lime-text"}`}>
                  {recommendedPerformance}
                </p>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2">
              <Field label={<Text ro="Set" en="Set" />} htmlFor="set-number">
                <Input id="set-number" center type="number" readOnly aria-readonly="true"
                  value={sessionSets.filter((s) => s.exercise === exercise).length + 1} compact />
              </Field>
              <Field label={unit} htmlFor="set-weight">
                <Input id="set-weight" big type="number" inputMode="decimal" step="0.5" min={0} max={Math.floor(toUnit(10000))}
                  value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0" compact />
              </Field>
              <Field label={<Text ro="Repetări" en="Reps" />} htmlFor="set-reps">
                <Input id="set-reps" big type="number" inputMode="numeric" min={1} required
                  value={reps} onChange={(e) => setReps(e.target.value)} placeholder="0" compact />
              </Field>
              <Field label="RIR" htmlFor="set-rir">
                <Input id="set-rir" big type="number" inputMode="numeric" min={0} max={5}
                  value={rir} onChange={(e) => setRir(e.target.value)} placeholder="–" compact />
              </Field>
            </div>

            <Field label={<Text ro="Tip set" en="Set type" />}>
              <Select
                title={t("Tip set", "Set type")}
                value={setType}
                onChange={(value) => setSetType(value as SetType)}
                options={SET_TYPES.map((type) => ({ value: type, label: workoutLabelText(type, t) }))}
              />
            </Field>

            <Field label={<><Text ro="Notițe" en="Notes" /> <span className="font-normal opacity-70"><Text ro="(opțional)" en="(optional)" /></span></>} htmlFor="set-notes">
              <Input id="set-notes" type="text" maxLength={99} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder={t("Ex: Scaunul la 3...", "E.g. Seat at 3...")} />
            </Field>

            <Button type="submit" variant="secondary" icon={Plus}>
              <Text ro="Adaugă setul" en="Add set" />
            </Button>
            <RestTimerSettings timer={restTimer} />
          </Card>
        </form>
      )}

      {mode === "cardio" && (
        <form onSubmit={handleAddCardio}>
          <Card>
            <Field label={<Text ro="Activitate (LISS / HIIT)" en="Activity (LISS / HIIT)" />}>
              <Select
                title={t("Activitate", "Activity")}
                value={cardioActivity}
                onChange={setCardioActivity}
                options={CARDIO_ACTIVITIES.map((act) => ({ value: act, label: cardioName(act, language) }))}
              />
            </Field>
            <Field label={<Text ro="Durată (minute)" en="Duration (minutes)" />} htmlFor="cardio-duration">
              <Input id="cardio-duration" big type="number" inputMode="numeric" min={1} required
                value={cardioDuration} onChange={(e) => setCardioDuration(e.target.value)} placeholder={t("ex: 30", "e.g. 30")} />
            </Field>
            <Button type="submit" variant="secondary" icon={Plus}>
              <Text ro="Adaugă activitatea" en="Add activity" />
            </Button>
          </Card>
        </form>
      )}
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
      <h2 className="mt-2 pl-0.5 text-[13px] font-medium text-muted lg:mt-0">
        <Text ro="Sesiunea curentă" en="Current session" />
      </h2>
      {mode === "strength" ? (
        <SetRows
          rows={sessionSets.map((s, index) => ({
            key: s.id, ordinal: ordinals[index], exercise: s.exercise, weightKg: s.weight, reps: s.reps,
            rir: s.rir, setType: s.setType, notes: s.notes, record: personalRecords.has(s.id),
          }))}
          onRemove={(key) => setSessionSets((prev) => prev.filter((x) => x.id !== key))}
          empty={t("Niciun set încă. Adaugă primul set mai sus.", "No sets yet. Add your first set above.")}
        />
      ) : (
        <CardioRows
          rows={cardioEntries.map((c) => ({ key: c.id, activity: c.activity, durationMin: c.durationMin }))}
          onRemove={(key) => setCardioEntries((prev) => prev.filter((x) => x.id !== key))}
          empty={t("Nicio activitate încă.", "No activities yet.")}
        />
      )}

      {error && <Message>{error}</Message>}

      {hasEntries && (
        <Button large icon={Save} onClick={handleFinish} busy={isSaving || saveLocked} className="mt-4">
          <Text ro="Finalizează antrenamentul" en="Finish workout" />
        </Button>
      )}
      </div>
      </div>
      <RestTimerBar timer={restTimer} />
      {finished && (
        <WorkoutSummaryDialog
          input={finished.input}
          onClose={() => {
            // /offline needs a full load: without network the router cannot fetch it.
            if (finished.next === "/offline") window.location.assign(finished.next);
            else router.push(finished.next);
          }}
        />
      )}
    </Screen>
  );
}
