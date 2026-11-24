import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { Text } from "@/app/components/language-provider";
import { getLanguage } from "@/app/language";
import { requireCoach } from "@/lib/coach/auth";
import {
  DEFAULT_ADHERENCE_DAYS,
  classifyClientAdherence,
  cutoffDateYmd,
  parseRangeDays,
  summarizeNutritionByDay,
} from "@/lib/coach/analytics";
import { localDate, type DailyWeight } from "@/lib/daily-metrics";
import { attachCheckinPhotoUrls } from "@/lib/checkin-photos";
import type { EnrollmentStatus, FeedbackReaction, WeeklyCheckin } from "@/lib/coach/types";
import type { FeedbackThreadItem } from "@/app/feedback/actions";
import { Card, CardTitle, Screen } from "@/app/components/ui";
import { PendingRequestsCard } from "../../pending-requests-card";
import {
  ClientDetail,
  type ClientDailyCheckin,
  type ClientEnrollmentDetail,
  type ClientMealPlanSummary,
  type ClientTargets,
  type ClientWorkoutDetail,
  type CoachMealPlanTemplateOption,
  type CoachProgramOption,
} from "./client-detail";
import type { MealPlanGoal, MealPlanStatus } from "@/lib/coach/meal-plans";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;

type RawEnrollment = {
  id: string;
  program_id: string | null;
  status: EnrollmentStatus;
  share_nutrition: boolean;
  current_week: number;
  started_at: string | null;
  created_at: string;
};

type RawWorkout = {
  id: string;
  performed_on: string;
  split: string;
  workout_mode: string;
  program_workout_id: string | null;
  workout_sets: {
    id: string;
    exercise: string;
    set_number: number;
    set_type: string;
    weight: number | string;
    reps: number;
    rir: number | null;
    notes: string | null;
    is_pr: boolean;
  }[] | null;
  cardio_sessions: {
    id: string;
    activity: string;
    duration_min: number;
  }[] | null;
};

type RawMeal = {
  performed_on: string;
  meal_items: {
    total_kcal: number | string | null;
    total_protein_g: number | string | null;
    total_carbs_g: number | string | null;
    total_fat_g: number | string | null;
  }[] | null;
};

export default async function CoachClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; tab?: string }>;
}) {
  const { id: clientId } = await params;
  const { range: rawRange, tab: rawTab } = await searchParams;
  const { t } = await getLanguage();
  const coach = await requireCoach();

  const rangeDays = parseRangeDays(rawRange);
  const initialTab =
    rawTab === "workouts" || rawTab === "nutrition" || rawTab === "program" ? rawTab : "overview";

  const [{ data: enrollmentsData }, { data: coachProgramsData }] = await Promise.all([
    coach.supabase
      .from("enrollments")
      .select("id, program_id, status, share_nutrition, current_week, started_at, created_at")
      .eq("coach_id", coach.userId)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    coach.supabase
      .from("programs")
      .select("id, title, assigned_client_id")
      .eq("coach_id", coach.userId)
      .order("updated_at", { ascending: false }),
  ]);

  const rawEnrollments = (enrollmentsData ?? []) as RawEnrollment[];
  if (rawEnrollments.length === 0) notFound();

  const coachProgramsRaw = (coachProgramsData ?? []) as { id: string; title: string; assigned_client_id: string | null }[];
  const programMap = new Map(coachProgramsRaw.map((p) => [p.id, p]));

  const hasActive = rawEnrollments.some((e) => e.status === "active");
  const pendingEnrollments = rawEnrollments.filter((e) => e.status === "pending");

  if (!hasActive) {
    return (
      <Screen back="/coach/clients" title={`${t("Client", "Client")} #${clientId.slice(0, 6)}`}>
        {pendingEnrollments.length > 0 && (
          <PendingRequestsCard
            requests={pendingEnrollments.map((e) => ({
              id: e.id,
              clientId,
              clientName: `${t("Client", "Client")} #${clientId.slice(0, 6)}`,
              programTitle: (e.program_id && programMap.get(e.program_id)?.title) || t("Program", "Program"),
              createdAt: e.created_at,
            }))}
          />
        )}
        <Card>
          <CardTitle
            description={
              <Text
                ro="Conform regulilor de confidențialitate (RLS), istoricul de antrenamente, măsurătorile și progresul sunt vizibile doar cât timp clientul are status Activ."
                en="Per privacy rules (RLS), workout history, measurements, and progress are only visible while the client has an Active enrollment."
              />
            }
          >
            <span className="flex items-center gap-2">
              <Lock className="size-5 text-muted" />
              <Text ro="Client inactiv sau în așteptare" en="Inactive or pending client" />
            </span>
          </CardTitle>
        </Card>
      </Screen>
    );
  }

  const today = localDate();
  const cutoff = cutoffDateYmd(today, rangeDays);
  const checkinCutoff = cutoffDateYmd(today, 14);
  const shareNutrition = rawEnrollments.some((e) => e.status === "active" && e.share_nutrition);

  // Paginated fetch for client workouts in the selected date range (avoids PostgREST 1000-row cap).
  async function fetchClientWorkouts(): Promise<RawWorkout[]> {
    const out: RawWorkout[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await coach.supabase
        .from("workouts")
        .select("id, performed_on, split, workout_mode, program_workout_id, workout_sets(id, exercise, set_number, set_type, weight, reps, rir, notes, is_pr), cardio_sessions(id, activity, duration_min)")
        .eq("user_id", clientId)
        .gte("performed_on", cutoff)
        .lte("performed_on", today)
        .order("performed_on", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      out.push(...((data ?? []) as RawWorkout[]));
      if (!data || data.length < PAGE_SIZE) break;
    }
    return out;
  }

  async function fetchClientWeights(): Promise<DailyWeight[]> {
    const out: DailyWeight[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await coach.supabase
        .from("daily_weight")
        .select("date, weight_kg")
        .eq("user_id", clientId)
        .gte("date", cutoff)
        .lte("date", today)
        .order("date", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      out.push(
        ...((data ?? []) as { date: string; weight_kg: number | string }[]).map((r) => ({
          date: r.date,
          weight_kg: Number(r.weight_kg),
        })),
      );
      if (!data || data.length < PAGE_SIZE) break;
    }
    return out;
  }

  async function fetchClientMeals(): Promise<RawMeal[]> {
    if (!shareNutrition) return [];
    const out: RawMeal[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await coach.supabase
        .from("meals")
        .select("performed_on, meal_items(total_kcal, total_protein_g, total_carbs_g, total_fat_g)")
        .eq("user_id", clientId)
        .gte("performed_on", cutoff)
        .lte("performed_on", today)
        .order("performed_on", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      out.push(...((data ?? []) as RawMeal[]));
      if (!data || data.length < PAGE_SIZE) break;
    }
    return out;
  }

  const [
    { data: clientProfile },
    { data: latestWorkoutRow },
    rawWorkouts,
    weights,
    rawMeals,
    { data: targetsData },
    { data: dailyCheckinsData },
    { data: weeklyCheckinsData },
    { data: coachNoteData },
    { data: coachMealPlansData },
  ] = await Promise.all([
    coach.supabase.from("profiles").select("display_name").eq("id", clientId).maybeSingle(),
    coach.supabase
      .from("workouts")
      .select("performed_on")
      .eq("user_id", clientId)
      .order("performed_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
    fetchClientWorkouts(),
    fetchClientWeights(),
    fetchClientMeals(),
    shareNutrition
      ? coach.supabase.from("user_targets").select("kcal, protein, carbs, fat, fiber").eq("user_id", clientId).maybeSingle()
      : Promise.resolve({ data: null }),
    coach.supabase
      .from("daily_checkin")
      .select("date, energy, satiety, sleep, note")
      .eq("user_id", clientId)
      .gte("date", checkinCutoff)
      .order("date", { ascending: false })
      .limit(14),
    coach.supabase
      .from("weekly_checkins")
      .select("*")
      .eq("client_id", clientId)
      .eq("coach_id", coach.userId)
      .order("week_start", { ascending: false })
      .limit(8),
    coach.supabase
      .from("coach_client_notes")
      .select("note, updated_at")
      .eq("coach_id", coach.userId)
      .eq("client_id", clientId)
      .maybeSingle(),
    coach.supabase
      .from("meal_plans")
      .select("id, assigned_client_id, title, goal, status, target_kcal, target_protein_g, target_carbs_g, target_fat_g, share_token, updated_at")
      .eq("coach_id", coach.userId)
      .order("updated_at", { ascending: false }),
  ]);

  // Resolve titles for program_workouts linked to logged workouts.
  const pwIds = [...new Set(rawWorkouts.map((w) => w.program_workout_id).filter((x): x is string => Boolean(x)))];
  const pwTitleMap = new Map<string, string>();
  if (pwIds.length > 0) {
    const { data: pwRows } = await coach.supabase
      .from("program_workouts")
      .select("id, title")
      .in("id", pwIds);
    for (const row of pwRows ?? []) {
      pwTitleMap.set(row.id as string, row.title as string);
    }
  }

  const clientName =
    (clientProfile?.display_name as string | null | undefined)?.trim() ||
    `${t("Client", "Client")} #${clientId.slice(0, 6)}`;
  const coachName = coach.displayName?.trim() || t("Antrenor", "Coach");

  // Load feedback threads for the client's workouts in this period.
  const feedbackByWorkout = new Map<string, FeedbackThreadItem[]>();
  const workoutIds = rawWorkouts.map((w) => w.id);
  for (let i = 0; i < workoutIds.length; i += 200) {
    const chunk = workoutIds.slice(i, i + 200);
    const { data: fbRows } = await coach.supabase
      .from("workout_feedback")
      .select("id, workout_id, author_id, body, reaction, created_at")
      .in("workout_id", chunk)
      .order("created_at", { ascending: true });
    for (const row of fbRows ?? []) {
      const wid = row.workout_id as string;
      const authorId = row.author_id as string;
      const isCoachAuthor = authorId === coach.userId;
      const list = feedbackByWorkout.get(wid) ?? [];
      list.push({
        id: row.id as string,
        workoutId: wid,
        authorId,
        authorName: isCoachAuthor ? coachName : clientName,
        isCoachAuthor,
        body: row.body as string,
        reaction: (row.reaction as FeedbackReaction | null) ?? null,
        createdAt: row.created_at as string,
      });
      feedbackByWorkout.set(wid, list);
    }
  }

  // Sort exercises by frequency in this period so the most relevant exercises appear first.
  const exerciseCounts = new Map<string, number>();
  const workouts: ClientWorkoutDetail[] = rawWorkouts.map((w) => {
    const sets = (w.workout_sets ?? [])
      .map((s) => {
        if (s.set_type !== "Warmup") {
          exerciseCounts.set(s.exercise, (exerciseCounts.get(s.exercise) ?? 0) + 1);
        }
        return {
          id: s.id,
          exercise: s.exercise,
          set_number: s.set_number,
          set_type: s.set_type,
          weight: Number(s.weight),
          reps: s.reps,
          rir: s.rir,
          notes: s.notes,
          is_pr: Boolean(s.is_pr),
        };
      })
      .sort((a, b) => a.set_number - b.set_number);

    return {
      id: w.id,
      performed_on: w.performed_on,
      split: w.split,
      workout_mode: w.workout_mode,
      program_workout_title: w.program_workout_id ? (pwTitleMap.get(w.program_workout_id) ?? null) : null,
      workout_sets: sets,
      cardio_sessions: w.cardio_sessions ?? [],
      feedback: feedbackByWorkout.get(w.id) ?? [],
    };
  });

  const exercises = [...exerciseCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);

  const activeStart =
    rawEnrollments
      .filter((e) => e.status === "active")
      .map((e) => e.started_at ?? e.created_at)
      .sort()[0] ?? null;

  const adherence = classifyClientAdherence(
    {
      lastWorkoutDate: (latestWorkoutRow?.performed_on as string | undefined) ?? null,
      enrollmentStartedAt: activeStart,
    },
    today,
    DEFAULT_ADHERENCE_DAYS,
  );

  const enrollments: ClientEnrollmentDetail[] = rawEnrollments.map((e) => {
    const prog = e.program_id ? programMap.get(e.program_id) : undefined;
    return {
      id: e.id,
      program_id: e.program_id,
      program_title: prog?.title ?? null,
      is_custom_for_client: prog?.assigned_client_id === clientId,
      status: e.status,
      share_nutrition: e.share_nutrition,
      current_week: e.current_week,
    };
  });

  const coachPrograms: CoachProgramOption[] = coachProgramsRaw
    .filter((p) => p.assigned_client_id === null || p.assigned_client_id === clientId)
    .map((p) => ({
      id: p.id,
      title: p.title,
      isCustomForClient: p.assigned_client_id === clientId,
    }));

  const weeklyCheckins = await attachCheckinPhotoUrls(
    coach.supabase,
    (weeklyCheckinsData ?? []) as WeeklyCheckin[],
  );

  type RawCoachPlanRow = {
    id: string;
    assigned_client_id: string | null;
    title: string;
    goal: MealPlanGoal;
    status: MealPlanStatus;
    target_kcal: number | null;
    target_protein_g: number | null;
    target_carbs_g: number | null;
    target_fat_g: number | null;
    share_token: string | null;
    updated_at: string;
  };
  const allCoachMealPlans = (coachMealPlansData ?? []) as RawCoachPlanRow[];
  const clientMealPlans: ClientMealPlanSummary[] = allCoachMealPlans
    .filter((p) => p.assigned_client_id === clientId)
    .map((p) => ({
      id: p.id,
      title: p.title,
      goal: p.goal,
      status: p.status,
      targetKcal: p.target_kcal,
      targetProteinG: p.target_protein_g,
      targetCarbsG: p.target_carbs_g,
      targetFatG: p.target_fat_g,
      hasPublicLink: Boolean(p.share_token),
      updatedAt: p.updated_at,
    }));
  const mealPlanTemplates: CoachMealPlanTemplateOption[] = allCoachMealPlans
    .filter((p) => p.assigned_client_id === null)
    .map((p) => ({
      id: p.id,
      title: p.title,
      targetKcal: p.target_kcal,
    }));

  return (
    <Screen back="/coach/clients" title={clientName}>
      <ClientDetail
        coachId={coach.userId}
        clientId={clientId}
        rangeDays={rangeDays}
        initialTab={initialTab}
        adherence={adherence}
        enrollments={enrollments}
        workouts={workouts}
        exercises={exercises}
        weights={weights}
        shareNutrition={shareNutrition}
        nutritionSummary={summarizeNutritionByDay(rawMeals)}
        targets={(targetsData as ClientTargets | null) ?? null}
        dailyCheckins={(dailyCheckinsData ?? []) as ClientDailyCheckin[]}
        weeklyCheckins={weeklyCheckins}
        coachPrograms={coachPrograms}
        clientMealPlans={clientMealPlans}
        mealPlanTemplates={mealPlanTemplates}
        initialNote={(coachNoteData?.note as string | undefined) ?? ""}
        initialNoteUpdatedAt={(coachNoteData?.updated_at as string | undefined) ?? null}
      />
    </Screen>
  );
}
