import { redirect } from "next/navigation";
import { Text } from "@/app/components/language-provider";
import { getLanguage } from "@/app/language";
import { createClient } from "@/lib/supabase/server";
import {
  isValidInviteCode,
  normalizeInviteCode,
  type CoachProfile,
  type EnrollmentStatus,
  type ProgramDifficulty,
  type ProgramGoal,
  type ProgramInvitePreview,
} from "@/lib/coach/types";
import { pickNextProgramWorkout } from "@/lib/coach/programs";
import { Screen } from "@/app/components/ui";
import { ExploreClient, type MyEnrollmentCard, type PublicProgramCard } from "./explore-client";

export const dynamic = "force-dynamic";

type PublicProgramRow = {
  id: string;
  coach_id: string;
  title: string;
  description: string | null;
  difficulty: ProgramDifficulty;
  duration_weeks: number;
  goal: ProgramGoal;
  requires_approval: boolean;
  program_workouts: { id: string }[] | null;
};

type MyEnrollmentRow = {
  id: string;
  program_id: string | null;
  coach_id: string;
  status: EnrollmentStatus;
  share_nutrition: boolean;
  current_week: number;
};

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { t } = await getLanguage();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { code: rawCode } = await searchParams;
  const normalizedCode = rawCode ? normalizeInviteCode(rawCode) : "";

  const [
    { data: programsData },
    { data: coachesData },
    { data: enrollmentsData },
    inviteLookup,
  ] = await Promise.all([
    supabase
      .from("programs")
      .select("id, coach_id, title, description, difficulty, duration_weeks, goal, requires_approval, program_workouts(id)")
      .eq("status", "published")
      .eq("access_type", "public")
      .is("assigned_client_id", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("coach_profiles")
      .select("user_id, display_name, bio, specialties, is_public, accepting_clients, created_at, updated_at")
      .eq("is_public", true)
      .order("display_name", { ascending: true }),
    supabase
      .from("enrollments")
      .select("id, program_id, coach_id, status, share_nutrition, current_week")
      .eq("client_id", user.id)
      .in("status", ["pending", "active", "paused"])
      .order("created_at", { ascending: false }),
    normalizedCode && isValidInviteCode(normalizedCode)
      ? supabase.rpc("preview_program_by_invite", { p_code: normalizedCode })
      : Promise.resolve({ data: null, error: null }),
  ]);

  const rawPrograms = (programsData ?? []) as PublicProgramRow[];
  const publicCoaches = (coachesData ?? []) as CoachProfile[];
  const rawEnrollments = (enrollmentsData ?? []) as MyEnrollmentRow[];

  // Resolve coach display names for all referenced coaches (public + enrolled).
  const coachIds = [
    ...new Set([
      ...rawPrograms.map((p) => p.coach_id),
      ...rawEnrollments.map((e) => e.coach_id),
    ]),
  ];
  const coachNameMap = new Map<string, string>(publicCoaches.map((c) => [c.user_id, c.display_name]));
  const missingCoachIds = coachIds.filter((id) => !coachNameMap.has(id));
  if (missingCoachIds.length > 0) {
    const { data: extraCoaches } = await supabase
      .from("coach_profiles")
      .select("user_id, display_name")
      .in("user_id", missingCoachIds);
    for (const c of extraCoaches ?? []) {
      coachNameMap.set(c.user_id as string, c.display_name as string);
    }
  }

  // Resolve titles and next recommended workouts for user's enrollments.
  const enrolledProgramIds = [...new Set(rawEnrollments.map((e) => e.program_id).filter((id): id is string => Boolean(id)))];
  const programTitleMap = new Map<string, string>();
  const workoutsByProgram = new Map<string, { id: string; week_number: number; day_number: number; position: number }[]>();
  const completedByEnrollment = new Map<string, Set<string>>();

  if (enrolledProgramIds.length > 0) {
    const [{ data: enrolledProgs }, { data: pWorkouts }, { data: loggedWorkouts }] = await Promise.all([
      supabase.from("programs").select("id, title").in("id", enrolledProgramIds),
      supabase
        .from("program_workouts")
        .select("id, program_id, week_number, day_number, position")
        .in("program_id", enrolledProgramIds),
      supabase
        .from("workouts")
        .select("enrollment_id, program_workout_id")
        .eq("user_id", user.id)
        .in("enrollment_id", rawEnrollments.map((e) => e.id))
        .not("program_workout_id", "is", null),
    ]);

    for (const p of enrolledProgs ?? []) {
      programTitleMap.set(p.id as string, p.title as string);
    }
    for (const w of pWorkouts ?? []) {
      const pid = w.program_id as string;
      const list = workoutsByProgram.get(pid) ?? [];
      list.push({
        id: w.id as string,
        week_number: w.week_number as number,
        day_number: w.day_number as number,
        position: w.position as number,
      });
      workoutsByProgram.set(pid, list);
    }
    for (const lw of loggedWorkouts ?? []) {
      const eid = lw.enrollment_id as string | null;
      const pwid = lw.program_workout_id as string | null;
      if (!eid || !pwid) continue;
      const set = completedByEnrollment.get(eid) ?? new Set<string>();
      set.add(pwid);
      completedByEnrollment.set(eid, set);
    }
  }

  const publicPrograms: PublicProgramCard[] = rawPrograms.map((p) => ({
    id: p.id,
    coach_id: p.coach_id,
    coach_name: coachNameMap.get(p.coach_id) ?? t("Antrenor", "Coach"),
    title: p.title,
    description: p.description,
    difficulty: p.difficulty,
    duration_weeks: p.duration_weeks,
    goal: p.goal,
    requires_approval: p.requires_approval,
    workout_count: p.program_workouts?.length ?? 0,
  }));

  const myEnrollments: MyEnrollmentCard[] = rawEnrollments.map((e) => {
    const pWorkouts = e.program_id ? (workoutsByProgram.get(e.program_id) ?? []) : [];
    const nextWorkout = e.status === "active"
      ? pickNextProgramWorkout(pWorkouts, completedByEnrollment.get(e.id) ?? new Set(), e.current_week)
      : null;
    return {
      id: e.id,
      program_id: e.program_id,
      program_title: (e.program_id && programTitleMap.get(e.program_id)) || t("Program asignat", "Assigned program"),
      coach_name: coachNameMap.get(e.coach_id) ?? t("Antrenor", "Coach"),
      status: e.status,
      share_nutrition: e.share_nutrition,
      current_week: e.current_week,
      next_workout_id: nextWorkout?.id ?? null,
    };
  });

  const previewRows = (inviteLookup.data ?? []) as ProgramInvitePreview[];
  const initialInvitePreview = previewRows[0] ?? null;
  const initialInviteError =
    normalizedCode && !isValidInviteCode(normalizedCode)
      ? t("Codul de invitație din link nu este valid.", "The invite code in the link is not valid.")
      : normalizedCode && !initialInvitePreview
        ? t("Nu am găsit niciun program publicat pentru codul din link.", "No published program was found for the invite code in the link.")
        : null;

  return (
    <Screen title={<Text ro="Programe & Antrenori" en="Programs & Coaches" />}>
      <ExploreClient
        currentUserId={user.id}
        publicPrograms={publicPrograms}
        publicCoaches={publicCoaches}
        myEnrollments={myEnrollments}
        initialInviteCode={normalizedCode}
        initialInvitePreview={initialInvitePreview}
        initialInviteError={initialInviteError}
      />
    </Screen>
  );
}
