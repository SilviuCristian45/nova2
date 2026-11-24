import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { Text } from "@/app/components/language-provider";
import { getLanguage } from "@/app/language";
import { createClient } from "@/lib/supabase/server";
import { mondayOfWeek } from "@/lib/coach/interactions";
import { attachCheckinPhotoUrls } from "@/lib/checkin-photos";
import { localDate } from "@/lib/daily-metrics";
import type { WeeklyCheckin } from "@/lib/coach/types";
import { Empty, Screen, buttonClass } from "@/app/components/ui";
import { WeeklyCheckinClient, type ActiveCoachOption } from "./weekly-checkin-client";

export const dynamic = "force-dynamic";

export default async function WeeklyCheckinPage() {
  const { t } = await getLanguage();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const weekStart = mondayOfWeek(localDate());

  const [{ data: activeEnrollments }, { data: latestWeightRow }, { data: historyRows }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, coach_id, program_id")
      .eq("client_id", user.id)
      .eq("status", "active")
      .order("started_at", { ascending: false }),
    supabase
      .from("daily_weight")
      .select("weight_kg")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("weekly_checkins")
      .select("*")
      .eq("client_id", user.id)
      .order("week_start", { ascending: false })
      .limit(16),
  ]);

  const enrollments = (activeEnrollments ?? []) as { id: string; coach_id: string; program_id: string | null }[];
  if (enrollments.length === 0) {
    return (
      <Screen title={<Text ro="Check-in săptămânal" en="Weekly check-in" />}>
        <Empty icon={ClipboardCheck}>
          <Text
            ro="Check-in-ul săptămânal este disponibil când ai un antrenor activ."
            en="Weekly check-ins are available once you have an active coach."
          />
        </Empty>
        <Link href="/explore" className={buttonClass()}>
          <Text ro="Descoperă programe & antrenori" en="Browse programs & coaches" />
        </Link>
      </Screen>
    );
  }

  // Deduplicate coaches while keeping their primary active enrollment.
  const byCoach = new Map<string, { id: string; program_id: string | null }>();
  for (const e of enrollments) {
    if (!byCoach.has(e.coach_id)) byCoach.set(e.coach_id, { id: e.id, program_id: e.program_id });
  }
  const coachIds = [...byCoach.keys()];
  const programIds = [...new Set([...byCoach.values()].map((v) => v.program_id).filter((x): x is string => Boolean(x)))];

  const [{ data: coachProfiles }, { data: programsData }] = await Promise.all([
    supabase.from("coach_profiles").select("user_id, display_name").in("user_id", coachIds),
    programIds.length > 0
      ? supabase.from("programs").select("id, title").in("id", programIds)
      : Promise.resolve({ data: [] }),
  ]);

  const coachNameMap = new Map<string, string>(
    (coachProfiles ?? []).map((c) => [c.user_id as string, c.display_name as string]),
  );
  const programMap = new Map<string, string>(
    (programsData ?? []).map((p) => [p.id as string, p.title as string]),
  );

  const coaches: ActiveCoachOption[] = coachIds.map((coachId) => {
    const info = byCoach.get(coachId)!;
    return {
      coachId,
      coachName: coachNameMap.get(coachId) ?? t("Antrenor", "Coach"),
      enrollmentId: info.id,
      programTitle: info.program_id ? (programMap.get(info.program_id) ?? null) : null,
    };
  });

  const latestWeightKg = latestWeightRow?.weight_kg !== undefined && latestWeightRow?.weight_kg !== null
    ? Number(latestWeightRow.weight_kg)
    : null;

  const history = await attachCheckinPhotoUrls(supabase, (historyRows ?? []) as WeeklyCheckin[]);

  return (
    <Screen title={<Text ro="Check-in săptămânal" en="Weekly check-in" />}>
      <WeeklyCheckinClient
        userId={user.id}
        weekStart={weekStart}
        coaches={coaches}
        latestWeightKg={latestWeightKg}
        history={history}
      />
    </Screen>
  );
}
