import Link from "next/link";
import { ChevronRight, Users, Utensils } from "lucide-react";
import { Text } from "@/app/components/language-provider";
import { getLanguage } from "@/app/language";
import { requireCoach } from "@/lib/coach/auth";
import { DEFAULT_ADHERENCE_DAYS, classifyClientAdherence } from "@/lib/coach/analytics";
import { enrollmentStatusLabel } from "@/lib/coach/programs";
import { localDate } from "@/lib/daily-metrics";
import type { EnrollmentStatus } from "@/lib/coach/types";
import { Badge, Card, Columns, Empty, Screen } from "@/app/components/ui";
import { PendingRequestsCard, type PendingRequestItem } from "../pending-requests-card";

export const dynamic = "force-dynamic";

type EnrollmentRow = {
  id: string;
  client_id: string;
  program_id: string | null;
  status: EnrollmentStatus;
  share_nutrition: boolean;
  current_week: number;
  started_at: string | null;
  created_at: string;
};

const statusTone: Record<EnrollmentStatus, "lime" | "gold" | "red" | undefined> = {
  active: "lime",
  pending: "gold",
  paused: undefined,
  completed: undefined,
  rejected: "red",
};

export default async function CoachClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; program?: string }>;
}) {
  const { t } = await getLanguage();
  const coach = await requireCoach();
  const { status: rawStatus, program: programFilter } = await searchParams;

  const statusFilter =
    rawStatus === "active" || rawStatus === "pending" || rawStatus === "paused" || rawStatus === "completed"
      ? rawStatus
      : "all";

  let query = coach.supabase
    .from("enrollments")
    .select("id, client_id, program_id, status, share_nutrition, current_week, started_at, created_at")
    .eq("coach_id", coach.userId)
    .neq("status", "rejected")
    .order("created_at", { ascending: false });

  if (statusFilter !== "all") query = query.eq("status", statusFilter);
  if (programFilter) query = query.eq("program_id", programFilter);

  const [{ data: enrollmentsData }, { data: programsData }, { data: pendingNotifs }] = await Promise.all([
    query,
    coach.supabase
      .from("programs")
      .select("id, title")
      .eq("coach_id", coach.userId)
      .order("title", { ascending: true }),
    coach.supabase
      .from("notifications")
      .select("payload")
      .eq("user_id", coach.userId)
      .eq("type", "enroll_requested")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const enrollments = (enrollmentsData ?? []) as EnrollmentRow[];
  const programs = (programsData ?? []) as { id: string; title: string }[];
  const programMap = new Map(programs.map((p) => [p.id, p.title]));

  const clientNames = new Map<string, string>();
  for (const notif of pendingNotifs ?? []) {
    const payload = notif.payload as Record<string, unknown> | null;
    const cid = typeof payload?.client_id === "string" ? payload.client_id : null;
    const cname = typeof payload?.client_name === "string" ? payload.client_name.trim() : "";
    if (cid && cname && !clientNames.has(cid)) clientNames.set(cid, cname);
  }

  const activeClientIds = [...new Set(enrollments.filter((e) => e.status === "active").map((e) => e.client_id))];
  const lastWorkoutByClient = new Map<string, string>();

  if (activeClientIds.length > 0) {
    const [{ data: profilesData }, { data: latestDatesData }] = await Promise.all([
      coach.supabase.from("profiles").select("id, display_name").in("id", activeClientIds),
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
    for (const row of latestDatesData ?? []) {
      const cid = row.user_id as string;
      if (!lastWorkoutByClient.has(cid)) lastWorkoutByClient.set(cid, row.performed_on as string);
    }
  }

  const labelClient = (id: string) => clientNames.get(id) ?? `${t("Client", "Client")} #${id.slice(0, 6)}`;
  const today = localDate();

  const pendingItems: PendingRequestItem[] = enrollments
    .filter((e) => e.status === "pending")
    .map((e) => ({
      id: e.id,
      clientId: e.client_id,
      clientName: labelClient(e.client_id),
      programTitle: (e.program_id && programMap.get(e.program_id)) || t("Program", "Program"),
      createdAt: e.created_at,
    }));

  const buildHref = (nextStatus: string, nextProgram?: string) => {
    const sp = new URLSearchParams();
    if (nextStatus !== "all") sp.set("status", nextStatus);
    if (nextProgram) sp.set("program", nextProgram);
    const qs = sp.toString();
    return qs ? `/coach/clients?${qs}` : "/coach/clients";
  };

  return (
    <Screen back="/coach" title={<Text ro="Clienți" en="Clients" />}>
      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {(["all", "active", "pending", "paused", "completed"] as const).map((item) => {
          const active = statusFilter === item;
          return (
            <Link
              key={item}
              href={buildHref(item, programFilter)}
              className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
                active ? "bg-lime text-on-solid" : "bg-card text-muted"
              }`}
            >
              {item === "all" ? t("Toți", "All") : enrollmentStatusLabel(item, t)}
            </Link>
          );
        })}
      </div>

      {/* Program filter pills */}
      {programs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={buildHref(statusFilter, undefined)}
            className={`inline-flex min-h-8 items-center rounded-full px-3 text-xs font-semibold transition-colors ${
              !programFilter ? "bg-control text-foreground" : "bg-inner text-muted"
            }`}
          >
            <Text ro="Toate programele" en="All programs" />
          </Link>
          {programs.map((p) => (
            <Link
              key={p.id}
              href={buildHref(statusFilter, p.id)}
              className={`inline-flex min-h-8 items-center rounded-full px-3 text-xs font-semibold transition-colors ${
                programFilter === p.id ? "bg-control text-foreground" : "bg-inner text-muted"
              }`}
            >
              {p.title}
            </Link>
          ))}
        </div>
      )}

      {pendingItems.length > 0 && <PendingRequestsCard requests={pendingItems} />}

      {enrollments.length === 0 ? (
        <Empty icon={Users}>
          <Text
            ro="Nu ai clienți care să corespundă filtrelor selectate."
            en="No clients match the selected filters."
          />
        </Empty>
      ) : (
        <Columns>
          {enrollments.map((e) => {
            const progTitle = (e.program_id && programMap.get(e.program_id)) || t("Fără program", "No program");
            const adherence =
              e.status === "active"
                ? classifyClientAdherence(
                    {
                      lastWorkoutDate: lastWorkoutByClient.get(e.client_id) ?? null,
                      enrollmentStartedAt: e.started_at ?? e.created_at,
                    },
                    today,
                    DEFAULT_ADHERENCE_DAYS,
                  )
                : null;

            return (
              <Card key={e.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">{labelClient(e.client_id)}</h2>
                    <p className="truncate text-xs text-muted">
                      {progTitle} · {t("Săpt.", "Wk")} {e.current_week}
                    </p>
                  </div>
                  <Badge tone={statusTone[e.status]}>{enrollmentStatusLabel(e.status, t)}</Badge>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {adherence?.kind === "on_track" && (
                    <Badge tone="lime">
                      {adherence.daysSinceWorkout === 0
                        ? t("Antrenat azi", "Trained today")
                        : t(`Acum ${adherence.daysSinceWorkout} zile`, `${adherence.daysSinceWorkout}d ago`)}
                    </Badge>
                  )}
                  {adherence?.kind === "inactive" && (
                    <Badge tone="red">
                      {t(`Pauză ${adherence.daysSinceWorkout} zile`, `Paused ${adherence.daysSinceWorkout}d`)}
                    </Badge>
                  )}
                  {adherence?.kind === "new_no_workouts" && (
                    <Badge tone="ice">
                      <Text ro="Nou · 0 antrenamente" en="New · 0 workouts" />
                    </Badge>
                  )}
                  {adherence?.kind === "new_overdue" && (
                    <Badge tone="gold">
                      {t(`Nou · ${adherence.daysSinceStart}z fără antrenament`, `New · ${adherence.daysSinceStart}d no workout`)}
                    </Badge>
                  )}
                  {e.status === "active" && (
                    <Badge tone={e.share_nutrition ? "ice" : undefined} className="gap-1">
                      <Utensils className="size-3" />
                      {e.share_nutrition ? t("Nutriție partajată", "Nutrition shared") : t("Nutriție privată", "Nutrition private")}
                    </Badge>
                  )}
                </div>

                <Link
                  href={`/coach/clients/${e.client_id}`}
                  className="inline-flex items-center justify-between rounded-md bg-inner px-3.5 py-2.5 text-sm font-semibold text-foreground transition-colors active:bg-control"
                >
                  <span><Text ro="Deschide profil client" en="Open client profile" /></span>
                  <ChevronRight className="size-4 text-muted" />
                </Link>
              </Card>
            );
          })}
        </Columns>
      )}
    </Screen>
  );
}
