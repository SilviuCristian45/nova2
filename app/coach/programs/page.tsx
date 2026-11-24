import Link from "next/link";
import { ClipboardList, Plus, Users } from "lucide-react";
import { Text } from "@/app/components/language-provider";
import { getLanguage } from "@/app/language";
import { requireCoach } from "@/lib/coach/auth";
import {
  accessTypeLabel,
  difficultyLabel,
  goalLabel,
  programStatusLabel,
} from "@/lib/coach/programs";
import type { Program, ProgramStatus } from "@/lib/coach/types";
import { Badge, Card, Columns, Empty, Screen, buttonClass } from "@/app/components/ui";
import { CopyInviteButton } from "./copy-invite-button";

export const dynamic = "force-dynamic";

type ProgramListRow = Program & {
  program_workouts: { id: string }[] | null;
  enrollments: { id: string; status: string }[] | null;
};

const statusTone: Record<ProgramStatus, "lime" | "gold" | undefined> = {
  published: "lime",
  draft: "gold",
  archived: undefined,
};

export default async function CoachProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { t } = await getLanguage();
  const coach = await requireCoach();
  const { status: rawFilter } = await searchParams;
  const filter = rawFilter === "draft" || rawFilter === "published" || rawFilter === "archived" ? rawFilter : "all";

  let query = coach.supabase
    .from("programs")
    .select("*, program_workouts(id), enrollments(id, status)")
    .eq("coach_id", coach.userId)
    .order("updated_at", { ascending: false });

  if (filter !== "all") {
    query = query.eq("status", filter);
  }

  const { data, error } = await query;
  const programs = (data ?? []) as ProgramListRow[];

  const filterHref = (next: string) => (next === "all" ? "/coach/programs" : `/coach/programs?status=${next}`);

  return (
    <Screen
      back="/coach"
      title={<Text ro="Programe & Cursuri" en="Programs & Courses" />}
      right={
        <Link href="/coach/programs/new" className={buttonClass({ small: true })}>
          <Plus className="size-4" />
          <Text ro="Program nou" en="New program" />
        </Link>
      }
    >
      <div className="flex flex-wrap gap-2">
        {(["all", "published", "draft", "archived"] as const).map((item) => {
          const active = filter === item;
          return (
            <Link
              key={item}
              href={filterHref(item)}
              className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
                active ? "bg-lime text-on-solid" : "bg-card text-muted"
              }`}
            >
              {item === "all" ? t("Toate", "All") : programStatusLabel(item, t)}
            </Link>
          );
        })}
      </div>

      {error ? (
        <Card tone="red">
          <p className="text-sm font-semibold">{error.message}</p>
        </Card>
      ) : programs.length === 0 ? (
        <Empty icon={ClipboardList}>
          <Text ro="Nu ai încă programe în această categorie." en="You have no programs in this category yet." />
        </Empty>
      ) : (
        <Columns>
          {programs.map((program) => {
            const workoutCount = program.program_workouts?.length ?? 0;
            const activeCount = (program.enrollments ?? []).filter((e) => e.status === "active").length;
            const pendingCount = (program.enrollments ?? []).filter((e) => e.status === "pending").length;

            return (
              <Card key={program.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <h2 className="text-[20px] font-semibold tracking-[-0.4px]">{program.title}</h2>
                    {program.description && (
                      <p className="line-clamp-2 text-[13px] text-soft">{program.description}</p>
                    )}
                  </div>
                  <Badge tone={statusTone[program.status]}>
                    {programStatusLabel(program.status, t)}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="ice">{goalLabel(program.goal, t)}</Badge>
                  <Badge>{difficultyLabel(program.difficulty, t)}</Badge>
                  <Badge>{program.duration_weeks} {t("săpt.", "wk")}</Badge>
                  <Badge>{workoutCount} {t("zile", "days")}</Badge>
                  <Badge tone={program.access_type === "invite_only" ? "lilac" : undefined}>
                    {accessTypeLabel(program.access_type, t)}
                  </Badge>
                  {program.assigned_client_id && (
                    <Badge tone="gold"><Text ro="Personalizat client" en="Client custom" /></Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-inner px-3 py-2 text-xs font-medium text-soft">
                  <span className="flex items-center gap-1.5">
                    <Users className="size-3.5" />
                    {activeCount} {t("activi", "active")}
                    {pendingCount > 0 && ` · ${pendingCount} ${t("în așteptare", "pending")}`}
                  </span>
                  {program.invite_code && (
                    <span className="font-mono font-bold text-foreground">{program.invite_code}</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/coach/programs/${program.id}`}
                    className={buttonClass({ variant: "primary", small: true })}
                  >
                    <Text ro="Editează" en="Edit" />
                  </Link>
                  {program.invite_code && <CopyInviteButton code={program.invite_code} />}
                </div>
              </Card>
            );
          })}
        </Columns>
      )}
    </Screen>
  );
}
