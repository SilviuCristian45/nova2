"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Dumbbell,
  Globe,
  Lock,
  Plus,
  Save,
  Trophy,
  Utensils,
} from "lucide-react";
import { Text, useLanguage } from "@/app/components/language-provider";
import { useUnits } from "@/app/components/units-provider";
import { ExerciseName, CardioName } from "@/app/components/exercise-name";
import { WorkoutLabel } from "@/app/components/workout-label";
import { RecordBadge, SetTypeBadge } from "@/app/components/workout-parts";
import { CoachCheckinReviewList } from "@/app/components/coach-checkin-review";
import { WorkoutFeedbackThread } from "@/app/components/workout-feedback";
import type { FeedbackThreadItem } from "@/app/feedback/actions";
import {
  Badge,
  BigNumber,
  Button,
  Card,
  CardTitle,
  Columns,
  Empty,
  Field,
  Input,
  Message,
  ProgressBar,
  Segmented,
  Select,
  Textarea,
  buttonClass,
} from "@/app/components/ui";
import {
  averageRir,
  type ClientAdherence,
  type NutritionPeriodSummary,
} from "@/lib/coach/analytics";
import { enrollmentStatusLabel } from "@/lib/coach/programs";
import {
  mealPlanGoalLabel,
  mealPlanStatusLabel,
  type MealPlanGoal,
  type MealPlanStatus,
} from "@/lib/coach/meal-plans";
import type { EnrollmentStatus, WeeklyCheckinWithPhotos } from "@/lib/coach/types";
import type { DailyWeight } from "@/lib/daily-metrics";
import { ClientCharts } from "./client-charts";
import { cloneMealPlanForClientAction } from "../../meal-plans/actions";
import {
  assignProgramToClientAction,
  cloneProgramForClientAction,
  saveCoachClientNoteAction,
  updateEnrollmentStatusAction,
  updateEnrollmentWeekAction,
} from "../actions";

export type ClientWorkoutDetail = {
  id: string;
  performed_on: string;
  split: string;
  workout_mode: string;
  program_workout_title: string | null;
  workout_sets: {
    id: string;
    exercise: string;
    set_number: number;
    set_type: string;
    weight: number;
    reps: number;
    rir: number | null;
    notes: string | null;
    is_pr: boolean;
  }[];
  cardio_sessions: {
    id: string;
    activity: string;
    duration_min: number;
  }[];
  feedback: FeedbackThreadItem[];
};

export type ClientEnrollmentDetail = {
  id: string;
  program_id: string | null;
  program_title: string | null;
  is_custom_for_client: boolean;
  status: EnrollmentStatus;
  share_nutrition: boolean;
  current_week: number;
};

export type ClientDailyCheckin = {
  date: string;
  energy: number | null;
  satiety: number | null;
  sleep: number | null;
  note: string | null;
};

export type ClientTargets = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

export type CoachProgramOption = {
  id: string;
  title: string;
  isCustomForClient: boolean;
};

export type ClientMealPlanSummary = {
  id: string;
  title: string;
  goal: MealPlanGoal;
  status: MealPlanStatus;
  targetKcal: number | null;
  targetProteinG: number | null;
  targetCarbsG: number | null;
  targetFatG: number | null;
  hasPublicLink: boolean;
  updatedAt: string;
};

export type CoachMealPlanTemplateOption = {
  id: string;
  title: string;
  targetKcal: number | null;
};

type TabKey = "overview" | "workouts" | "nutrition" | "program";

const WORKOUTS_PER_PAGE = 8;

export function ClientDetail({
  coachId,
  clientId,
  rangeDays,
  initialTab,
  adherence,
  enrollments,
  workouts,
  exercises,
  weights,
  shareNutrition,
  nutritionSummary,
  targets,
  dailyCheckins,
  weeklyCheckins,
  coachPrograms,
  clientMealPlans,
  mealPlanTemplates,
  initialNote,
  initialNoteUpdatedAt,
}: {
  coachId: string;
  clientId: string;
  rangeDays: 30 | 90 | 180;
  initialTab: TabKey;
  adherence: ClientAdherence;
  enrollments: ClientEnrollmentDetail[];
  workouts: ClientWorkoutDetail[];
  exercises: string[];
  weights: DailyWeight[];
  shareNutrition: boolean;
  nutritionSummary: NutritionPeriodSummary;
  targets: ClientTargets | null;
  dailyCheckins: ClientDailyCheckin[];
  weeklyCheckins: WeeklyCheckinWithPhotos[];
  coachPrograms: CoachProgramOption[];
  clientMealPlans: ClientMealPlanSummary[];
  mealPlanTemplates: CoachMealPlanTemplateOption[];
  initialNote: string;
  initialNoteUpdatedAt: string | null;
}) {
  const router = useRouter();
  const { t, locale } = useLanguage();
  const { format } = useUnits();

  const [tab, setTab] = useState<TabKey>(initialTab);
  const [workoutPage, setWorkoutPage] = useState(1);

  // Program management state
  const primaryEnrollment = enrollments.find((e) => e.status === "active") ?? enrollments[0];
  const [selectedStatus, setSelectedStatus] = useState<"active" | "paused" | "completed">(
    primaryEnrollment?.status === "paused" || primaryEnrollment?.status === "completed"
      ? primaryEnrollment.status
      : "active",
  );
  const [weekInput, setWeekInput] = useState(primaryEnrollment?.current_week ?? 1);
  const [assignProgramId, setAssignProgramId] = useState(
    primaryEnrollment?.program_id ?? coachPrograms[0]?.id ?? "",
  );
  const [cloneProgramId, setCloneProgramId] = useState(
    primaryEnrollment?.program_id ?? coachPrograms[0]?.id ?? "",
  );
  const [programBusy, setProgramBusy] = useState<string | null>(null);
  const [programError, setProgramError] = useState<string | null>(null);
  const [programMessage, setProgramMessage] = useState<string | null>(null);

  // Private coach notes state
  const [note, setNote] = useState(initialNote);
  const [noteUpdatedAt, setNoteUpdatedAt] = useState<string | null>(initialNoteUpdatedAt);
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSaved, setNoteSaved] = useState(false);

  // Meal plan clone state
  const [cloneMealPlanId, setCloneMealPlanId] = useState(mealPlanTemplates[0]?.id ?? "");
  const [cloningMealPlan, setCloningMealPlan] = useState(false);
  const [mealPlanError, setMealPlanError] = useState<string | null>(null);

  const allSets = workouts.flatMap((w) => w.workout_sets);
  const periodAvgRir = averageRir(allSets);
  const prCount = allSets.filter((s) => s.is_pr).length;
  const latestWeight = weights.length > 0 ? weights[weights.length - 1] : null;

  const totalWorkoutPages = Math.max(1, Math.ceil(workouts.length / WORKOUTS_PER_PAGE));
  const safeWorkoutPage = Math.min(workoutPage, totalWorkoutPages);
  const pagedWorkouts = workouts.slice(
    (safeWorkoutPage - 1) * WORKOUTS_PER_PAGE,
    safeWorkoutPage * WORKOUTS_PER_PAGE,
  );

  async function handleStatusSave() {
    if (!primaryEnrollment) return;
    setProgramBusy("status");
    setProgramError(null);
    setProgramMessage(null);
    try {
      const res = await updateEnrollmentStatusAction(primaryEnrollment.id, clientId, selectedStatus);
      if (res.error) setProgramError(res.error);
      else {
        setProgramMessage(t("Statusul înscrierii a fost actualizat.", "Enrollment status updated."));
        router.refresh();
      }
    } finally {
      setProgramBusy(null);
    }
  }

  async function handleWeekSave() {
    if (!primaryEnrollment) return;
    setProgramBusy("week");
    setProgramError(null);
    setProgramMessage(null);
    try {
      const res = await updateEnrollmentWeekAction(primaryEnrollment.id, clientId, weekInput);
      if (res.error) setProgramError(res.error);
      else {
        setProgramMessage(t("Săptămâna curentă a fost salvată.", "Current week saved."));
        router.refresh();
      }
    } finally {
      setProgramBusy(null);
    }
  }

  async function handleAssignProgram() {
    if (!primaryEnrollment || !assignProgramId) return;
    setProgramBusy("assign");
    setProgramError(null);
    setProgramMessage(null);
    try {
      const res = await assignProgramToClientAction(primaryEnrollment.id, clientId, assignProgramId);
      if (res.error) setProgramError(res.error);
      else {
        setProgramMessage(t("Programul a fost asignat clientului.", "Program assigned to client."));
        router.refresh();
      }
    } finally {
      setProgramBusy(null);
    }
  }

  async function handleCloneAndCustomize() {
    if (!cloneProgramId) return;
    setProgramBusy("clone");
    setProgramError(null);
    setProgramMessage(null);
    try {
      const res = await cloneProgramForClientAction(cloneProgramId, clientId);
      if (res.error) {
        setProgramError(res.error);
        return;
      }
      if (res.programId) {
        router.push(`/coach/programs/${res.programId}`);
      }
    } finally {
      setProgramBusy(null);
    }
  }

  async function handleCloneMealPlan() {
    if (!cloneMealPlanId) return;
    setCloningMealPlan(true);
    setMealPlanError(null);
    try {
      const res = await cloneMealPlanForClientAction(cloneMealPlanId, clientId);
      if (res.error) {
        setMealPlanError(res.error);
        return;
      }
      if (res.planId) {
        router.push(`/coach/meal-plans/${res.planId}`);
      }
    } finally {
      setCloningMealPlan(false);
    }
  }

  async function handleSaveNote(e: React.FormEvent) {
    e.preventDefault();
    setSavingNote(true);
    setNoteError(null);
    setNoteSaved(false);
    try {
      const res = await saveCoachClientNoteAction(clientId, note);
      if (res.error) {
        setNoteError(res.error);
        return;
      }
      if (res.updatedAt) setNoteUpdatedAt(res.updatedAt);
      setNoteSaved(true);
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {/* Top adherence + range filter strip */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {adherence.kind === "on_track" && (
            <Badge tone="lime">
              {adherence.daysSinceWorkout === 0
                ? t("Antrenat azi", "Trained today")
                : t(`Activ · acum ${adherence.daysSinceWorkout}z`, `Active · ${adherence.daysSinceWorkout}d ago`)}
            </Badge>
          )}
          {adherence.kind === "inactive" && (
            <Badge tone="red">
              {t(`Pauză de ${adherence.daysSinceWorkout} zile`, `Paused for ${adherence.daysSinceWorkout} days`)}
            </Badge>
          )}
          {adherence.kind === "new_no_workouts" && (
            <Badge tone="ice">
              <Text ro="Client nou · 0 antrenamente" en="New client · 0 workouts" />
            </Badge>
          )}
          {adherence.kind === "new_overdue" && (
            <Badge tone="gold">
              {t(`Nou-înscris de ${adherence.daysSinceStart}z · 0 antrenamente`, `Enrolled ${adherence.daysSinceStart}d ago · 0 workouts`)}
            </Badge>
          )}
          {primaryEnrollment?.program_title && (
            <Badge>{primaryEnrollment.program_title} · {t("Săpt.", "Wk")} {primaryEnrollment.current_week}</Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {([30, 90, 180] as const).map((days) => (
            <Link
              key={days}
              href={`/coach/clients/${clientId}?range=${days}&tab=${tab}`}
              className={`inline-flex min-h-9 items-center rounded-full px-3 text-xs font-semibold transition-colors ${
                rangeDays === days ? "bg-lime text-on-solid" : "bg-card text-muted"
              }`}
            >
              {days}{t("z", "d")}
            </Link>
          ))}
        </div>
      </div>

      {/* Clean mobile-first tab bar */}
      <Segmented
        label={t("Secțiune client", "Client section")}
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: t("Progres", "Progress") },
          { value: "workouts", label: `${t("Antrenamente", "Workouts")} (${workouts.length})` },
          { value: "nutrition", label: t("Nutriție", "Nutrition") },
          { value: "program", label: t("Program & Note", "Program & Notes") },
        ]}
      />

      {/* TAB 1: Overview & Progress */}
      {tab === "overview" && (
        <div className="flex flex-col gap-4 lg:gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card>
              <span className="text-xs font-medium text-muted">
                {t(`Antrenamente (${rangeDays}z)`, `Workouts (${rangeDays}d)`)}
              </span>
              <BigNumber value={workouts.length} />
            </Card>
            <Card>
              <span className="text-xs font-medium text-muted">
                <Text ro="RIR mediu" en="Avg RIR" />
              </span>
              <BigNumber value={periodAvgRir !== null ? periodAvgRir : "–"} />
            </Card>
            <Card>
              <span className="text-xs font-medium text-muted">
                <Text ro="Recorduri (PR)" en="PRs hit" />
              </span>
              <BigNumber value={prCount} />
            </Card>
            <Card>
              <span className="text-xs font-medium text-muted">
                <Text ro="Greutate recentă" en="Latest weight" />
              </span>
              <BigNumber value={latestWeight ? format(latestWeight.weight_kg) : "–"} />
            </Card>
          </div>

          <ClientCharts workouts={workouts} weights={weights} exercises={exercises} />

          {/* Weekly & Daily Check-ins */}
          <Columns>
            <Card>
              <CardTitle
                description={
                  <Text
                    ro="Check-in-urile săptămânale ale clientului — poți răspunde direct de aici."
                    en="Client's weekly check-ins — reply directly from here."
                  />
                }
              >
                <Text ro="Check-in-uri săptămânale" en="Weekly check-ins" />
              </CardTitle>
              <CoachCheckinReviewList items={weeklyCheckins} />
            </Card>

            <Card>
              <CardTitle
                description={
                  <Text ro="Starea zilnică (1–10) din ultimele 14 zile." en="Daily wellness scores (1–10) from the last 14 days." />
                }
              >
                <Text ro="Check-in zilnic recent" en="Recent daily check-ins" />
              </CardTitle>
              {dailyCheckins.length === 0 ? (
                <p className="rounded-md bg-inner px-3.5 py-4 text-sm text-muted">
                  <Text ro="Niciun check-in zilnic recent." en="No recent daily check-ins." />
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {dailyCheckins.map((c) => (
                    <div key={c.date} className="flex flex-col gap-1 rounded-md bg-inner px-3 py-2.5 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">
                          {new Date(`${c.date}T00:00:00`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {c.energy !== null && <Badge tone="lime">{t("En.", "En.")} {c.energy}/10</Badge>}
                          {c.satiety !== null && <Badge tone="gold">{t("Saț.", "Sat.")} {c.satiety}/10</Badge>}
                          {c.sleep !== null && <Badge tone="ice">{t("Somn", "Sleep")} {c.sleep}/10</Badge>}
                        </div>
                      </div>
                      {c.note && <p className="text-xs text-soft">{c.note}</p>}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </Columns>
        </div>
      )}

      {/* TAB 2: Workouts History */}
      {tab === "workouts" && (
        <div className="flex flex-col gap-4">
          {workouts.length === 0 ? (
            <Empty icon={Dumbbell}>
              <Text ro="Niciun antrenament în acest interval." en="No workouts in this period." />
            </Empty>
          ) : (
            <>
              <Columns>
                {pagedWorkouts.map((w) => {
                  const isCardio = w.workout_mode === "cardio";
                  const avgRir = averageRir(w.workout_sets);
                  const prTotal = w.workout_sets.filter((s) => s.is_pr).length;
                  const dateLabel = new Date(`${w.performed_on}T00:00:00`).toLocaleDateString(locale, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });

                  const grouped = new Map<string, ClientWorkoutDetail["workout_sets"]>();
                  for (const s of w.workout_sets) {
                    const list = grouped.get(s.exercise) ?? [];
                    list.push(s);
                    grouped.set(s.exercise, list);
                  }

                  return (
                    <Card key={w.id}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="text-lg font-bold">
                            {isCardio ? "Cardio" : <WorkoutLabel value={w.split} />}
                          </h3>
                          <p className="text-xs text-muted">
                            {dateLabel}
                            {w.program_workout_title ? ` · ${w.program_workout_title}` : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {avgRir !== null && <Badge tone="ice">RIR {avgRir}</Badge>}
                          {prTotal > 0 && (
                            <Badge tone="lime" className="gap-1">
                              <Trophy className="size-3" />
                              {prTotal} PR
                            </Badge>
                          )}
                        </div>
                      </div>

                      {isCardio ? (
                        <div className="flex flex-col gap-1.5">
                          {w.cardio_sessions.map((c) => (
                            <div key={c.id} className="flex items-center justify-between rounded-md bg-inner px-3 py-2 text-sm">
                              <span className="font-medium"><CardioName id={c.activity} /></span>
                              <Badge tone="coral">{c.duration_min} min</Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {[...grouped.entries()].map(([ex, sets]) => (
                            <div key={ex} className="flex flex-col gap-1 rounded-md bg-inner p-2.5">
                              <span className="text-sm font-semibold"><ExerciseName id={ex} /></span>
                              {sets.map((s, idx) => (
                                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span className="flex items-center gap-1.5 font-medium tabular-nums">
                                    <span className="text-muted">#{idx + 1}</span>
                                    <span>
                                      {Number(s.weight) > 0 ? `${format(Number(s.weight))} × ` : ""}{s.reps}
                                    </span>
                                    {s.rir !== null && <span className="text-muted">RIR {s.rir}</span>}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    {s.is_pr && <RecordBadge />}
                                    <SetTypeBadge type={s.set_type} />
                                  </span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="border-t border-line pt-3">
                        <WorkoutFeedbackThread
                          workoutId={w.id}
                          currentUserId={coachId}
                          initialItems={w.feedback}
                          showReactions
                          collapsible={w.feedback.length === 0}
                          clientIdForRevalidate={clientId}
                          placeholderRo="Lasă feedback pe această sesiune..."
                          placeholderEn="Leave feedback on this session..."
                        />
                      </div>
                    </Card>
                  );
                })}
              </Columns>

              {totalWorkoutPages > 1 && (
                <div className="flex items-center justify-between rounded-lg bg-card px-4 py-3">
                  <Button
                    variant="secondary"
                    small
                    icon={ChevronLeft}
                    disabled={safeWorkoutPage <= 1}
                    onClick={() => setWorkoutPage((p) => Math.max(1, p - 1))}
                  >
                    <Text ro="Anterior" en="Previous" />
                  </Button>
                  <span className="text-sm font-medium text-muted">
                    {safeWorkoutPage} / {totalWorkoutPages}
                  </span>
                  <Button
                    variant="secondary"
                    small
                    icon={ChevronRight}
                    disabled={safeWorkoutPage >= totalWorkoutPages}
                    onClick={() => setWorkoutPage((p) => Math.min(totalWorkoutPages, p + 1))}
                  >
                    <Text ro="Următor" en="Next" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 3: Nutrition */}
      {tab === "nutrition" && (
        <div className="flex flex-col gap-4">
          {/* Coach Meal Plans assigned to this client (always available regardless of diary sharing) */}
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <CardTitle
                description={
                  <Text
                    ro="Creează un plan alimentar personalizat, clonează un șablon sau exportă PDF direct pentru acest client."
                    en="Create a custom meal plan, clone a template, or export PDF directly for this client."
                  />
                }
              >
                <span className="flex items-center gap-2">
                  <Utensils className="size-5 text-lime-text" />
                  <Text ro="Planuri alimentare client" en="Client meal plans" />
                </span>
              </CardTitle>
              <Link
                href={`/coach/meal-plans/new?clientId=${clientId}`}
                className={buttonClass({ small: true })}
              >
                <Plus className="size-4" />
                <Text ro="Plan alimentar nou" en="New meal plan" />
              </Link>
            </div>

            {mealPlanError && <Message>{mealPlanError}</Message>}

            {clientMealPlans.length === 0 ? (
              <p className="rounded-md bg-inner px-3.5 py-3 text-sm text-muted">
                <Text
                  ro="Acest client nu are încă un plan alimentar asignat."
                  en="This client does not have an assigned meal plan yet."
                />
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {clientMealPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-inner p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-foreground">{plan.title}</span>
                        <Badge tone={plan.status === "active" ? "lime" : plan.status === "draft" ? "gold" : undefined}>
                          {mealPlanStatusLabel(plan.status, t)}
                        </Badge>
                        <Badge tone="ice">{mealPlanGoalLabel(plan.goal, t)}</Badge>
                        {plan.hasPublicLink && (
                          <Badge tone="lime" className="gap-1">
                            <Globe className="size-3" />
                            <Text ro="Link" en="Link" />
                          </Badge>
                        )}
                      </div>
                      {(plan.targetKcal !== null || plan.targetProteinG !== null) && (
                        <p className="mt-1 text-xs text-muted tabular-nums">
                          {plan.targetKcal !== null ? `${plan.targetKcal} kcal` : ""}
                          {plan.targetProteinG !== null ? ` · P ${plan.targetProteinG}g` : ""}
                          {plan.targetCarbsG !== null ? ` · C ${plan.targetCarbsG}g` : ""}
                          {plan.targetFatG !== null ? ` · ${t("G", "F")} ${plan.targetFatG}g` : ""}
                        </p>
                      )}
                    </div>
                    <Link
                      href={`/coach/meal-plans/${plan.id}`}
                      className={buttonClass({ variant: "secondary", small: true })}
                    >
                      <Text ro="Editează & Export PDF" en="Edit & Export PDF" />
                    </Link>
                  </div>
                ))}
              </div>
            )}

            {mealPlanTemplates.length > 0 && (
              <div className="flex flex-col gap-2.5 rounded-md bg-inner p-3.5">
                <p className="text-sm font-semibold">
                  <Text ro="Clonează un șablon pentru acest client" en="Clone a template for this client" />
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <Select
                      searchable
                      title={t("Selectează șablonul", "Select template")}
                      value={cloneMealPlanId}
                      onChange={setCloneMealPlanId}
                      options={mealPlanTemplates.map((tpl) => ({
                        value: tpl.id,
                        label: tpl.title,
                        subtitle: tpl.targetKcal ? `${tpl.targetKcal} kcal` : undefined,
                      }))}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    small
                    icon={Copy}
                    busy={cloningMealPlan}
                    onClick={() => void handleCloneMealPlan()}
                  >
                    <Text ro="Clonează & personalizează" en="Clone & customize" />
                  </Button>
                </div>
              </div>
            )}
          </Card>

        {!shareNutrition ? (
          <Card>
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-inner text-muted">
                <Lock className="size-5" />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold">
                  <Text ro="Jurnal alimentar privat" en="Nutrition diary is private" />
                </h2>
                <p className="text-sm text-soft">
                  <Text
                    ro="Clientul nu a activat partajarea jurnalului alimentar. Acesta poate activa opțiunea oricând din secțiunea Programe & Antrenori (/explore)."
                    en="The client has not enabled nutrition diary sharing. They can turn it on anytime from Programs & Coaches (/explore)."
                  />
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            <Card>
              <CardTitle
                description={
                  <Text
                    ro={`Medie zilnică pe ${nutritionSummary.daysLogged} zile cu mese înregistrate (ultimele ${rangeDays} zile).`}
                    en={`Daily average across ${nutritionSummary.daysLogged} logged days (last ${rangeDays} days).`}
                  />
                }
              >
                <span className="flex items-center gap-2">
                  <Utensils className="size-5 text-lime-text" />
                  <Text ro="Sumar nutriție" en="Nutrition summary" />
                </span>
              </CardTitle>

              {nutritionSummary.daysLogged === 0 ? (
                <p className="rounded-md bg-inner px-3.5 py-4 text-sm text-muted">
                  <Text ro="Clientul nu a înregistrat mese în acest interval." en="No meals logged by the client in this period." />
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5 rounded-md bg-inner p-3">
                    <div className="flex justify-between text-sm font-semibold">
                      <span><Text ro="Calorii medii" en="Avg calories" /></span>
                      <span className="tabular-nums">
                        {nutritionSummary.avgKcal}{targets ? ` / ${targets.kcal}` : ""} kcal
                      </span>
                    </div>
                    {targets && <ProgressBar value={(nutritionSummary.avgKcal / Math.max(1, targets.kcal)) * 100} tone="lime" />}
                  </div>
                  <div className="flex flex-col gap-1.5 rounded-md bg-inner p-3">
                    <div className="flex justify-between text-sm font-semibold">
                      <span><Text ro="Proteine medii" en="Avg protein" /></span>
                      <span className="tabular-nums">
                        {nutritionSummary.avgProtein}g{targets ? ` / ${targets.protein}g` : ""}
                      </span>
                    </div>
                    {targets && <ProgressBar value={(nutritionSummary.avgProtein / Math.max(1, targets.protein)) * 100} tone="ice" />}
                  </div>
                  <div className="flex flex-col gap-1.5 rounded-md bg-inner p-3">
                    <div className="flex justify-between text-sm font-semibold">
                      <span><Text ro="Carbohidrați medii" en="Avg carbs" /></span>
                      <span className="tabular-nums">
                        {nutritionSummary.avgCarbs}g{targets ? ` / ${targets.carbs}g` : ""}
                      </span>
                    </div>
                    {targets && <ProgressBar value={(nutritionSummary.avgCarbs / Math.max(1, targets.carbs)) * 100} tone="gold" />}
                  </div>
                  <div className="flex flex-col gap-1.5 rounded-md bg-inner p-3">
                    <div className="flex justify-between text-sm font-semibold">
                      <span><Text ro="Grăsimi medii" en="Avg fat" /></span>
                      <span className="tabular-nums">
                        {nutritionSummary.avgFat}g{targets ? ` / ${targets.fat}g` : ""}
                      </span>
                    </div>
                    {targets && <ProgressBar value={(nutritionSummary.avgFat / Math.max(1, targets.fat)) * 100} tone="coral" />}
                  </div>
                </div>
              )}
            </Card>

            {nutritionSummary.days.length > 0 && (
              <Card>
                <CardTitle>
                  <Text ro="Zile înregistrate" en="Logged days" />
                </CardTitle>
                <div className="flex flex-col gap-2">
                  {nutritionSummary.days.slice(0, 21).map((day) => (
                    <div key={day.date} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-inner px-3.5 py-2.5 text-sm">
                      <span className="font-semibold">
                        {new Date(`${day.date}T00:00:00`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums">
                        <Badge tone="lime">{day.kcal} kcal</Badge>
                        <Badge tone="ice">P {day.protein}g</Badge>
                        <Badge tone="gold">C {day.carbs}g</Badge>
                        <Badge tone="coral">F {day.fat}g</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
        </div>
      )}

      {/* TAB 4: Program Management & Private Coach Notes */}
      {tab === "program" && (
        <Columns>
          <Card>
            <CardTitle
              description={
                <Text
                  ro="Asignează un program existent, clonează-l pentru personalizare dedicată sau actualizează săptămâna curentă."
                  en="Assign an existing program, clone it for client customization, or update the current week."
                />
              }
            >
              <Text ro="Program & Înscriere" en="Program & Enrollment" />
            </CardTitle>

            {programError && <Message>{programError}</Message>}
            {programMessage && <Message tone="lime">{programMessage}</Message>}

            {primaryEnrollment && (
              <div className="flex flex-col gap-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-inner p-3">
                  <div>
                    <p className="text-xs text-muted"><Text ro="Program curent" en="Current program" /></p>
                    <p className="font-semibold">
                      {primaryEnrollment.program_title ?? t("Fără program", "No program")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="lime">{enrollmentStatusLabel(primaryEnrollment.status, t)}</Badge>
                    {primaryEnrollment.is_custom_for_client && primaryEnrollment.program_id && (
                      <Link
                        href={`/coach/programs/${primaryEnrollment.program_id}`}
                        className={buttonClass({ variant: "secondary", small: true })}
                      >
                        <Text ro="Editează programul personalizat" en="Edit custom program" />
                      </Link>
                    )}
                  </div>
                </div>

                {/* Week & Status controls */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Field label={<Text ro="Săptămâna curentă" en="Current week" />}>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={52}
                        value={weekInput}
                        onChange={(e) => setWeekInput(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
                      />
                    </Field>
                    <Button variant="secondary" small busy={programBusy === "week"} onClick={handleWeekSave}>
                      <Text ro="Salvează săptămâna" en="Save week" />
                    </Button>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Field label={<Text ro="Status înscriere" en="Enrollment status" />}>
                      <Select
                        title={t("Status înscriere", "Enrollment status")}
                        value={selectedStatus}
                        onChange={(v) => setSelectedStatus(v as "active" | "paused" | "completed")}
                        options={[
                          { value: "active", label: enrollmentStatusLabel("active", t) },
                          { value: "paused", label: enrollmentStatusLabel("paused", t) },
                          { value: "completed", label: enrollmentStatusLabel("completed", t) },
                        ]}
                      />
                    </Field>
                    <Button variant="secondary" small busy={programBusy === "status"} onClick={handleStatusSave}>
                      <Text ro="Actualizează status" en="Update status" />
                    </Button>
                  </div>
                </div>

                <div className="h-px bg-line" />

                {/* Assign existing program */}
                {coachPrograms.length > 0 && (
                  <div className="flex flex-col gap-2.5">
                    <Field label={<Text ro="Asignează un program existent" en="Assign an existing program" />}>
                      <Select
                        searchable
                        title={t("Selectează programul", "Select program")}
                        value={assignProgramId}
                        onChange={setAssignProgramId}
                        options={coachPrograms.map((p) => ({
                          value: p.id,
                          label: p.title,
                          subtitle: p.isCustomForClient ? t("Personalizat", "Custom") : undefined,
                        }))}
                      />
                    </Field>
                    <Button variant="secondary" small busy={programBusy === "assign"} onClick={handleAssignProgram}>
                      <Text ro="Asignează programul" en="Assign program" />
                    </Button>
                  </div>
                )}

                <div className="h-px bg-line" />

                {/* Clone & customize specifically for this client */}
                {coachPrograms.length > 0 && (
                  <div className="flex flex-col gap-2.5 rounded-md bg-inner p-3.5">
                    <div>
                      <p className="font-semibold">
                        <Text ro="Personalizează program pentru acest client" en="Customize a program for this client" />
                      </p>
                      <p className="text-xs text-soft">
                        <Text
                          ro="Clonează un template într-un program privat dedicat clientului și te duce direct în builder pentru ajustări."
                          en="Clones a template into a private copy for this client and opens the builder directly."
                        />
                      </p>
                    </div>
                    <Select
                      searchable
                      title={t("Template de clonat", "Template to clone")}
                      value={cloneProgramId}
                      onChange={setCloneProgramId}
                      options={coachPrograms.map((p) => ({ value: p.id, label: p.title }))}
                    />
                    <Button icon={Copy} small busy={programBusy === "clone"} onClick={handleCloneAndCustomize}>
                      <Text ro="Clonează & personalizează" en="Clone & customize" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Private Coach Notes */}
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <CardTitle
                description={
                  <Text
                    ro="Observații despre tehnică, accidentări, preferințe sau planul pe săptămânile următoare."
                    en="Notes about technique, injuries, preferences, or upcoming adjustments."
                  />
                }
              >
                <span className="flex items-center gap-2">
                  <Lock className="size-5 text-lilac-text" />
                  <Text ro="Note private antrenor" en="Private coach notes" />
                </span>
              </CardTitle>
              <Badge tone="lilac" className="gap-1">
                <Lock className="size-3" />
                <Text ro="Vizibil doar pentru tine" en="Visible only to you" />
              </Badge>
            </div>

            <form onSubmit={handleSaveNote} className="flex flex-col gap-3">
              <Textarea
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  setNoteSaved(false);
                }}
                maxLength={4000}
                rows={8}
                placeholder={t(
                  "Scrie observații private despre client (nu sunt vizibile clientului și nu apar în exportul lui)...",
                  "Write private coaching notes (never visible to the client or included in their export)...",
                )}
              />
              {noteError && <Message>{noteError}</Message>}
              {noteSaved && (
                <Message tone="lime">
                  <span className="flex items-center gap-1.5">
                    <Check className="size-4" />
                    <Text ro="Notițele private au fost salvate." en="Private notes saved." />
                  </span>
                </Message>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="submit" icon={Save} busy={savingNote}>
                  <Text ro="Salvează notițele" en="Save notes" />
                </Button>
                {noteUpdatedAt && (
                  <span className="text-xs text-muted">
                    {t("Ultima actualizare", "Last updated")}:{" "}
                    {new Date(noteUpdatedAt).toLocaleString(locale, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
            </form>
          </Card>
        </Columns>
      )}
    </div>
  );
}
