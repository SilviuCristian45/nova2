import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Dumbbell,
  Settings,
  Trophy,
  UserPlus,
  Users,
  Utensils,
} from "lucide-react";
import { Text } from "@/app/components/language-provider";
import { getLanguage } from "@/app/language";
import { getWeightFormatter } from "@/app/units";
import { getOwnCoachProfile, requireCoach } from "@/lib/coach/auth";
import {
  DEFAULT_ADHERENCE_DAYS,
  averageRir,
  classifyClientAdherence,
  cutoffDateYmd,
} from "@/lib/coach/analytics";
import { localDate } from "@/lib/daily-metrics";
import { attachCheckinPhotoUrls } from "@/lib/checkin-photos";
import { exerciseName } from "@/lib/exercise-catalog";
import { WorkoutLabel } from "@/app/components/workout-label";
import { CoachCheckinReviewList, type CoachCheckinItem } from "@/app/components/coach-checkin-review";
import { WorkoutFeedbackThread } from "@/app/components/workout-feedback";
import type { FeedbackThreadItem } from "@/app/feedback/actions";
import type { FeedbackReaction, WeeklyCheckin } from "@/lib/coach/types";
import {
  Badge,
  BigNumber,
  Card,
  CardTitle,
  Columns,
  CtaCard,
  Empty,
  Screen,
  Stack,
  TextLink,
  buttonClass,
} from "@/app/components/ui";
import { PendingRequestsCard, type PendingRequestItem } from "./pending-requests-card";

export const dynamic = "force-dynamic";

type EnrollmentRow = {
  id: string;
  client_id: string;
  program_id: string | null;
  status: string;
  started_at: string | null;
  created_at: string;
};

type RecentWorkoutRow = {
  id: string;
  user_id: string;
  performed_on: string;
  split: string;
  workout_mode: string;
  created_at: string;
  workout_sets: {
    exercise: string;
    weight: number;
    reps: number;
    rir: number | null;
    set_type: string;
    is_pr: boolean;
  }[] | null;
  cardio_sessions: { activity: string; duration_min: number }[] | null;
};

export default async function CoachHomePage() {
  const { t, locale, language } = await getLanguage();
  const { format } = await getWeightFormatter(locale);
  const coach = await requireCoach();
  const today = localDate();
  const recentCutoff = cutoffDateYmd(today, 14);

  const [
    coachProfile,
    { data: enrollmentsData },
    { data: programsData },
    { data: mealPlansData },
    { data: pendingNotifs },
    { data: unreviewedCheckinsData },
  ] = await Promise.all([
    getOwnCoachProfile(coach.userId),
    coach.supabase
      .from("enrollments")
      .select("id, client_id, program_id, status, started_at, created_at")
      .eq("coach_id", coach.userId)
      .in("status", ["pending", "active", "paused"])
      .order("created_at", { ascending: false }),
    coach.supabase
      .from("programs")
      .select("id, title, status")
      .eq("coach_id", coach.userId),
    coach.supabase
      .from("meal_plans")
      .select("id, status, assigned_client_id")
      .eq("coach_id", coach.userId),
    coach.supabase
      .from("notifications")
      .select("payload")
      .eq("user_id", coach.userId)
      .eq("type", "enroll_requested")
      .order("created_at", { ascending: false })
      .limit(50),
    coach.supabase
      .from("weekly_checkins")
      .select("*")
      .eq("coach_id", coach.userId)
      .is("reviewed_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const enrollments = (enrollmentsData ?? []) as EnrollmentRow[];
  const programs = (programsData ?? []) as { id: string; title: string; status: string }[];
  const mealPlansCount = (mealPlansData ?? []).length;
  const programMap = new Map(programs.map((p) => [p.id, p.title]));
  const publishedCount = programs.filter((p) => p.status === "published").length;

  const activeEnrollments = enrollments.filter((e) => e.status === "active");
  const pendingEnrollments = enrollments.filter((e) => e.status === "pending");
  const activeClientIds = [...new Set(activeEnrollments.map((e) => e.client_id))];

  // Build client name lookup from profiles (active clients) + enroll_requested notifications (pending clients).
  const clientNames = new Map<string, string>();
  for (const notif of pendingNotifs ?? []) {
    const payload = notif.payload as Record<string, unknown> | null;
    const cid = typeof payload?.client_id === "string" ? payload.client_id : null;
    const cname = typeof payload?.client_name === "string" ? payload.client_name.trim() : "";
    if (cid && cname && !clientNames.has(cid)) clientNames.set(cid, cname);
  }

  let recentWorkouts: RecentWorkoutRow[] = [];
  const lastWorkoutByClient = new Map<string, string>();

  if (activeClientIds.length > 0) {
    const [{ data: profilesData }, { data: recentData }, { data: latestDatesData }] = await Promise.all([
      coach.supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", activeClientIds),
      coach.supabase
        .from("workouts")
        .select("id, user_id, performed_on, split, workout_mode, created_at, workout_sets(exercise, weight, reps, rir, set_type, is_pr), cardio_sessions(activity, duration_min)")
        .in("user_id", activeClientIds)
        .gte("performed_on", recentCutoff)
        .order("performed_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20),
      // Fetch recent workout dates (last 90d) to compute accurate adherence per active client.
      coach.supabase
        .from("workouts")
        .select("user_id, performed_on")
        .in("user_id", activeClientIds)
        .order("performed_on", { ascending: false })
        .limit(1000),
    ]);

    for (const p of profilesData ?? []) {
      const display = (p.display_name as string | null)?.trim();
      if (display) clientNames.set(p.id as string, display);
    }
    recentWorkouts = (recentData ?? []) as RecentWorkoutRow[];
    for (const row of latestDatesData ?? []) {
      const cid = row.user_id as string;
      const dt = row.performed_on as string;
      if (!lastWorkoutByClient.has(cid)) lastWorkoutByClient.set(cid, dt);
    }
  }

  const labelClient = (id: string) => clientNames.get(id) ?? `${t("Client", "Client")} #${id.slice(0, 6)}`;
  const coachName = coachProfile?.display_name ?? coach.displayName ?? t("Antrenor", "Coach");

  // Load existing feedback threads for the recent workouts in the activity feed.
  const feedbackByWorkout = new Map<string, FeedbackThreadItem[]>();
  const recentWorkoutIds = recentWorkouts.map((w) => w.id);
  if (recentWorkoutIds.length > 0) {
    const { data: fbRows } = await coach.supabase
      .from("workout_feedback")
      .select("id, workout_id, author_id, body, reaction, created_at")
      .in("workout_id", recentWorkoutIds)
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
        authorName: isCoachAuthor ? coachName : labelClient(authorId),
        isCoachAuthor,
        body: row.body as string,
        reaction: (row.reaction as FeedbackReaction | null) ?? null,
        createdAt: row.created_at as string,
      });
      feedbackByWorkout.set(wid, list);
    }
  }

  const signedUnreviewedCheckins = await attachCheckinPhotoUrls(
    coach.supabase,
    (unreviewedCheckinsData ?? []) as WeeklyCheckin[],
  );
  const unreviewedCheckins: CoachCheckinItem[] = signedUnreviewedCheckins.map((item) => ({
    ...item,
    clientName: labelClient(item.client_id),
  }));

  const pendingItems: PendingRequestItem[] = pendingEnrollments.map((e) => ({
    id: e.id,
    clientId: e.client_id,
    clientName: labelClient(e.client_id),
    programTitle: (e.program_id && programMap.get(e.program_id)) || t("Program", "Program"),
    createdAt: e.created_at,
  }));

  // Compute adherence per unique active client (earliest active start date for new-client check).
  const activeStartByClient = new Map<string, string | null>();
  for (const e of activeEnrollments) {
    const start = e.started_at ?? e.created_at;
    const prev = activeStartByClient.get(e.client_id);
    if (!prev || (start && start < prev)) activeStartByClient.set(e.client_id, start);
  }

  const pausedAlerts: { clientId: string; name: string; days: number; lastDate: string }[] = [];
  const newNoWorkouts: { clientId: string; name: string; daysSinceStart: number; overdue: boolean }[] = [];

  for (const clientId of activeClientIds) {
    const lastWorkoutDate = lastWorkoutByClient.get(clientId) ?? null;
    const adherence = classifyClientAdherence(
      { lastWorkoutDate, enrollmentStartedAt: activeStartByClient.get(clientId) ?? null },
      today,
      DEFAULT_ADHERENCE_DAYS,
    );
    if (adherence.kind === "inactive" && lastWorkoutDate) {
      pausedAlerts.push({
        clientId,
        name: labelClient(clientId),
        days: adherence.daysSinceWorkout,
        lastDate: lastWorkoutDate,
      });
    } else if (adherence.kind === "new_no_workouts" || adherence.kind === "new_overdue") {
      newNoWorkouts.push({
        clientId,
        name: labelClient(clientId),
        daysSinceStart: adherence.daysSinceStart,
        overdue: adherence.kind === "new_overdue",
      });
    }
  }
  pausedAlerts.sort((a, b) => b.days - a.days);
  newNoWorkouts.sort((a, b) => b.daysSinceStart - a.daysSinceStart);

  return (
    <Screen
      title={<Text ro="Zona Antrenor" en="Coach Studio" />}
      right={
        <div className="flex items-center gap-2">
          <Link href="/coach/clients" className={buttonClass({ variant: "secondary", small: true })}>
            <Users className="size-4" />
            <Text ro="Clienți" en="Clients" />
          </Link>
          <Link href="/settings" aria-label={t("Setări", "Settings")} className={buttonClass({ variant: "secondary", small: true })}>
            <Settings className="size-4" />
          </Link>
        </div>
      }
    >
      {/* Greeting & KPI strip */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {t("Salut", "Hi")}, <span className="font-semibold text-foreground">{coachName}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/coach/programs" className={buttonClass({ variant: "outline", small: true })}>
            <ClipboardList className="size-4" />
            <Text ro="Programe" en="Programs" /> ({programs.length})
          </Link>
          <Link href="/coach/meal-plans" className={buttonClass({ variant: "outline", small: true })}>
            <Utensils className="size-4" />
            <Text ro="Planuri alimentare" en="Meal plans" /> ({mealPlansCount})
          </Link>
          <Link href="/coach/programs/new" className={buttonClass({ small: true })}>
            <Text ro="+ Program nou" en="+ New program" />
          </Link>
          <Link href="/coach/meal-plans/new" className={buttonClass({ variant: "secondary", small: true })}>
            <Text ro="+ Plan alimentar" en="+ Meal plan" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <span className="text-[13px] font-medium text-muted">
            <Text ro="Clienți activi" en="Active clients" />
          </span>
          <BigNumber value={activeClientIds.length} />
          <TextLink href="/coach/clients?status=active">
            <Text ro="Vezi clienții" en="View clients" />
          </TextLink>
        </Card>
        <Card tone={pendingItems.length > 0 ? "gold" : undefined}>
          <span className="text-[13px] font-medium text-muted">
            <Text ro="Cereri în așteptare" en="Pending requests" />
          </span>
          <BigNumber value={pendingItems.length} />
          <TextLink href="/coach/clients?status=pending" tone={pendingItems.length > 0 ? "gold" : "lime"}>
            <Text ro="Gestionează cereri" en="Manage requests" />
          </TextLink>
        </Card>
        <Card tone={unreviewedCheckins.length > 0 ? "lilac" : undefined}>
          <span className="text-[13px] font-medium text-muted">
            <Text ro="Check-in-uri noi" en="Unreviewed check-ins" />
          </span>
          <BigNumber value={unreviewedCheckins.length} />
          <span className="text-xs font-medium text-soft">
            <Text ro="Răspuns rapid mai jos" en="Quick reply below" />
          </span>
        </Card>
        <Card>
          <span className="text-[13px] font-medium text-muted">
            <Text ro="Programe publicate" en="Published programs" />
          </span>
          <BigNumber value={publishedCount} unit={`/ ${programs.length}`} />
          <TextLink href="/coach/programs">
            <Text ro="Deschide programele" en="Open programs" />
          </TextLink>
        </Card>
      </div>

      {/* Actionable inline pending approvals */}
      <PendingRequestsCard requests={pendingItems} />

      {/* Unreviewed weekly check-ins quick review */}
      {unreviewedCheckins.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle
              description={
                <Text
                  ro="Răspunde rapid la check-in-urile săptămânale trimise de clienții activi."
                  en="Reply quickly to weekly check-ins submitted by active clients."
                />
              }
            >
              <span className="flex items-center gap-2">
                <ClipboardCheck className="size-5 text-lilac-text" />
                <Text ro="Check-in-uri săptămânale nerevizuite" en="Unreviewed weekly check-ins" />
              </span>
            </CardTitle>
            <Badge tone="lilac">{unreviewedCheckins.length}</Badge>
          </div>
          <CoachCheckinReviewList items={unreviewedCheckins} showClientLink />
        </Card>
      )}

      <Columns>
        {/* Left column: Adherence Alerts + Quick CTA */}
        <Stack>
          <Card>
            <div className="flex items-center justify-between gap-2">
              <CardTitle
                description={
                  <Text
                    ro={`Clienți activi fără antrenament de cel puțin ${DEFAULT_ADHERENCE_DAYS} zile vs. clienți nou-înscriși.`}
                    en={`Active clients inactive for ${DEFAULT_ADHERENCE_DAYS}+ days vs. newly enrolled clients.`}
                  />
                }
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="size-5 text-gold-text" />
                  <Text ro="Alerte aderență" en="Adherence alerts" />
                </span>
              </CardTitle>
            </div>

            {pausedAlerts.length === 0 && newNoWorkouts.length === 0 ? (
              <p className="rounded-md bg-inner px-3.5 py-3 text-sm text-soft">
                {activeClientIds.length === 0 ? (
                  <Text ro="Nu ai încă clienți activi." en="You have no active clients yet." />
                ) : (
                  <Text ro="Toți clienții activi sunt la zi cu antrenamentele." en="All active clients are on track with their workouts." />
                )}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {pausedAlerts.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-red-text">
                      <Text ro="Clienți în pauză (fără antrenament recent)" en="Paused clients (no recent workout)" />
                    </span>
                    {pausedAlerts.map((item) => (
                      <Link
                        key={item.clientId}
                        href={`/coach/clients/${item.clientId}`}
                        className="flex items-center justify-between gap-2 rounded-md bg-red-soft px-3 py-2.5 text-sm transition-opacity active:opacity-75"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{item.name}</p>
                          <p className="text-xs text-red-text">
                            {t(`Nu s-a mai antrenat de ${item.days} zile`, `No workout for ${item.days} days`)} ·{" "}
                            {t("ultimul", "last")}: {new Date(`${item.lastDate}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" })}
                          </p>
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-red-text" />
                      </Link>
                    ))}
                  </div>
                )}

                {newNoWorkouts.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-ice-text">
                      <UserPlus className="size-3.5" />
                      <Text ro="Clienți noi (0 antrenamente logate)" en="New clients (0 workouts logged yet)" />
                    </span>
                    {newNoWorkouts.map((item) => (
                      <Link
                        key={item.clientId}
                        href={`/coach/clients/${item.clientId}`}
                        className={`flex items-center justify-between gap-2 rounded-md px-3 py-2.5 text-sm transition-opacity active:opacity-75 ${
                          item.overdue ? "bg-gold-soft" : "bg-ice-soft"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{item.name}</p>
                          <p className={`text-xs ${item.overdue ? "text-gold-text" : "text-ice-text"}`}>
                            {item.overdue
                              ? t(
                                  `Nou-înscris de ${item.daysSinceStart} zile — încă fără primul antrenament`,
                                  `Enrolled ${item.daysSinceStart} days ago — no first workout yet`,
                                )
                              : t(
                                  `Abia înscris (${item.daysSinceStart === 0 ? "azi" : `acum ${item.daysSinceStart} zile`}) — urmează primul antrenament`,
                                  `Just joined (${item.daysSinceStart === 0 ? "today" : `${item.daysSinceStart}d ago`}) — first workout pending`,
                                )}
                          </p>
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-muted" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          <CtaCard
            href="/coach/programs/new"
            label={<Text ro="Builder programe" en="Program builder" />}
            title={<Text ro="Creează un program" en="Create a program" />}
          />
        </Stack>

        {/* Right column: Recent Activity & PR Feed */}
        <Stack>
          <Card>
            <CardTitle
              description={
                <Text
                  ro="Antrenamente recente ale clienților activi și recorduri personale (ultimele 14 zile)."
                  en="Recent active client workouts and personal records (last 14 days)."
                />
              }
            >
              <span className="flex items-center gap-2">
                <Activity className="size-5 text-lime-text" />
                <Text ro="Activitate recentă & PR-uri" en="Recent activity & PRs" />
              </span>
            </CardTitle>

            {recentWorkouts.length === 0 ? (
              <Empty icon={Dumbbell}>
                <Text
                  ro="Niciun antrenament recent în ultimele 14 zile."
                  en="No recent workouts in the last 14 days."
                />
              </Empty>
            ) : (
              <div className="flex flex-col gap-2">
                {recentWorkouts.map((w) => {
                  const sets = w.workout_sets ?? [];
                  const cardio = w.cardio_sessions ?? [];
                  const prSets = sets.filter((s) => s.is_pr);
                  const avgRir = averageRir(sets);
                  const dateText = new Date(`${w.performed_on}T00:00:00`).toLocaleDateString(locale, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  });

                  return (
                    <div
                      key={w.id}
                      className="flex flex-col gap-2.5 rounded-md bg-inner p-3"
                    >
                      <Link
                        href={`/coach/clients/${w.user_id}?tab=workouts`}
                        className="flex flex-wrap items-start justify-between gap-2 transition-opacity active:opacity-75"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{labelClient(w.user_id)}</p>
                          <p className="text-xs text-muted">
                            {w.workout_mode === "cardio" ? "Cardio" : <WorkoutLabel value={w.split} />} · {dateText}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {w.workout_mode === "strength" ? (
                            <Badge>{sets.length} {t("seturi", "sets")}</Badge>
                          ) : (
                            <Badge tone="coral">
                              {cardio.reduce((sum, c) => sum + c.duration_min, 0)} min
                            </Badge>
                          )}
                          {avgRir !== null && <Badge tone="ice">RIR {avgRir}</Badge>}
                          {prSets.length > 0 && (
                            <Badge tone="lime" className="gap-1">
                              <Trophy className="size-3" />
                              {prSets.length} PR
                            </Badge>
                          )}
                        </div>
                      </Link>

                      {prSets.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {prSets.slice(0, 3).map((pr, idx) => (
                            <span
                              key={`${w.id}-pr-${idx}`}
                              className="inline-flex items-center gap-1 rounded-sm bg-lime-soft px-2 py-0.5 text-xs font-semibold text-lime-text"
                            >
                              <Trophy className="size-3" />
                              {exerciseName(pr.exercise, language)} · {Number(pr.weight) > 0 ? `${format(Number(pr.weight))} × ` : ""}{pr.reps}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="border-t border-line pt-2">
                        <WorkoutFeedbackThread
                          workoutId={w.id}
                          currentUserId={coach.userId}
                          initialItems={feedbackByWorkout.get(w.id) ?? []}
                          showReactions
                          collapsible
                          clientIdForRevalidate={w.user_id}
                          placeholderRo="Lasă feedback rapid pe sesiune..."
                          placeholderEn="Leave quick feedback on this session..."
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <TextLink href="/coach/clients">
                <Text ro="Toți clienții" en="All clients" />
              </TextLink>
              <span className="flex items-center gap-1 text-xs text-muted">
                <Clock className="size-3.5" />
                <Text ro="Ultimele 14 zile" en="Last 14 days" />
              </span>
            </div>
          </Card>
        </Stack>
      </Columns>
    </Screen>
  );
}
