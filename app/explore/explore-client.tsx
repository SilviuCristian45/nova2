"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Award, CheckCircle2, Clock, KeyRound, Search, Sparkles, X } from "lucide-react";
import { Text, useLanguage } from "@/app/components/language-provider";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Columns,
  Empty,
  Input,
  Message,
  Select,
} from "@/app/components/ui";
import {
  PROGRAM_DIFFICULTIES,
  PROGRAM_GOALS,
  normalizeInviteCode,
  type CoachProfile,
  type EnrollmentStatus,
  type ProgramDifficulty,
  type ProgramGoal,
  type ProgramInvitePreview,
} from "@/lib/coach/types";
import {
  difficultyLabel,
  enrollmentStatusLabel,
  goalLabel,
} from "@/lib/coach/programs";
import {
  cancelPendingEnrollmentAction,
  enrollInProgramAction,
  lookupInviteCodeAction,
  toggleEnrollmentNutritionAction,
} from "./actions";

export type PublicProgramCard = {
  id: string;
  coach_id: string;
  coach_name: string;
  title: string;
  description: string | null;
  difficulty: ProgramDifficulty;
  duration_weeks: number;
  goal: ProgramGoal;
  requires_approval: boolean;
  workout_count: number;
};

export type MyEnrollmentCard = {
  id: string;
  program_id: string | null;
  program_title: string;
  coach_name: string;
  status: EnrollmentStatus;
  share_nutrition: boolean;
  current_week: number;
  next_workout_id: string | null;
};

export function ExploreClient({
  currentUserId,
  publicPrograms,
  publicCoaches,
  myEnrollments,
  initialInviteCode,
  initialInvitePreview,
  initialInviteError,
}: {
  currentUserId: string;
  publicPrograms: PublicProgramCard[];
  publicCoaches: CoachProfile[];
  myEnrollments: MyEnrollmentCard[];
  initialInviteCode: string;
  initialInvitePreview: ProgramInvitePreview | null;
  initialInviteError: string | null;
}) {
  const router = useRouter();
  const { t } = useLanguage();

  const [inviteCode, setInviteCode] = useState(initialInviteCode);
  const [invitePreview, setInvitePreview] = useState<ProgramInvitePreview | null>(initialInvitePreview);
  const [inviteError, setInviteError] = useState<string | null>(initialInviteError);
  const [lookingUp, setLookingUp] = useState(false);

  const [shareNutrition, setShareNutrition] = useState(true);
  const [goalFilter, setGoalFilter] = useState<string>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const enrollmentByProgram = new Map<string, MyEnrollmentCard>();
  for (const e of myEnrollments) {
    if (e.program_id && (e.status === "active" || e.status === "pending" || e.status === "paused")) {
      enrollmentByProgram.set(e.program_id, e);
    }
  }

  const filteredPrograms = publicPrograms.filter((p) => {
    if (goalFilter !== "all" && p.goal !== goalFilter) return false;
    if (difficultyFilter !== "all" && p.difficulty !== difficultyFilter) return false;
    return true;
  });

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setActionError(null);
    setActionSuccess(null);
    setLookingUp(true);
    try {
      const res = await lookupInviteCodeAction(inviteCode);
      if (res.error) {
        setInvitePreview(null);
        setInviteError(res.error);
      } else {
        setInvitePreview(res.preview ?? null);
      }
    } finally {
      setLookingUp(false);
    }
  }

  async function handleEnroll(programId: string, code?: string | null) {
    setBusyKey(`enroll-${programId}`);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await enrollInProgramAction(programId, code, shareNutrition);
      if (res.error) {
        setActionError(res.error);
        return;
      }
      setActionSuccess(
        t(
          "Înscrierea a fost înregistrată.",
          "Enrollment submitted successfully.",
        ),
      );
      router.refresh();
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCancelPending(enrollmentId: string) {
    setBusyKey(`cancel-${enrollmentId}`);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await cancelPendingEnrollmentAction(enrollmentId);
      if (res.error) {
        setActionError(res.error);
        return;
      }
      setActionSuccess(t("Cererea de înscriere a fost anulată.", "Enrollment request cancelled."));
      router.refresh();
    } finally {
      setBusyKey(null);
    }
  }

  async function handleToggleNutrition(enrollmentId: string, nextValue: boolean) {
    setBusyKey(`nutr-${enrollmentId}`);
    setActionError(null);
    try {
      const res = await toggleEnrollmentNutritionAction(enrollmentId, nextValue);
      if (res.error) {
        setActionError(res.error);
        return;
      }
      router.refresh();
    } finally {
      setBusyKey(null);
    }
  }

  function renderProgramActions(program: {
    id: string;
    coach_id: string;
    requires_approval: boolean;
  }, code?: string | null) {
    if (program.coach_id === currentUserId) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="ice"><Text ro="Programul tău" en="Your program" /></Badge>
          <Link href={`/coach/programs/${program.id}`} className="text-sm font-semibold text-lime-text">
            <Text ro="Editează" en="Edit" />
          </Link>
        </div>
      );
    }

    const existing = enrollmentByProgram.get(program.id);
    if (existing?.status === "active") {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="lime" className="gap-1">
            <CheckCircle2 className="size-3" />
            {enrollmentStatusLabel("active", t)}
          </Badge>
          <Link
            href={
              existing.next_workout_id
                ? `/insert?programWorkoutId=${existing.next_workout_id}&enrollmentId=${existing.id}`
                : "/"
            }
            className="text-sm font-semibold text-lime-text"
          >
            <Text ro="Începe antrenamentul" en="Start workout" />
          </Link>
        </div>
      );
    }

    if (existing?.status === "pending") {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="gold" className="gap-1">
            <Clock className="size-3" />
            {enrollmentStatusLabel("pending", t)}
          </Badge>
          <Button
            variant="soft"
            tone="red"
            small
            icon={X}
            busy={busyKey === `cancel-${existing.id}`}
            onClick={() => handleCancelPending(existing.id)}
          >
            <Text ro="Anulează cererea" en="Cancel request" />
          </Button>
        </div>
      );
    }

    if (existing?.status === "paused") {
      return <Badge>{enrollmentStatusLabel("paused", t)}</Badge>;
    }

    return (
      <Button
        small
        busy={busyKey === `enroll-${program.id}`}
        onClick={() => handleEnroll(program.id, code)}
      >
        {program.requires_approval ? (
          <Text ro="Trimite cerere de înscriere" en="Request to join" />
        ) : (
          <Text ro="Înscrie-te" en="Enroll" />
        )}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {actionError && <Message>{actionError}</Message>}
      {actionSuccess && <Message tone="lime">{actionSuccess}</Message>}

      {/* 1. Invite code entry + auto-preview for /explore?code=XXXX */}
      <Card>
        <CardTitle
          description={
            <Text
              ro="Ai primit un cod sau un link de la antrenorul tău? Introdu-l mai jos pentru a vedea programul și a te înscrie."
              en="Got an invite code or link from your coach? Enter it below to preview and join the program."
            />
          }
        >
          <span className="flex items-center gap-2">
            <KeyRound className="size-5 text-lime-text" />
            <Text ro="Înscrie-te cu cod de invitație" en="Join with invite code" />
          </span>
        </CardTitle>

        <form onSubmit={handleLookup} className="flex flex-col gap-2.5 sm:flex-row">
          <Input
            value={inviteCode}
            onChange={(e) => setInviteCode(normalizeInviteCode(e.target.value))}
            maxLength={16}
            placeholder={t("ex. AB12CD34", "e.g. AB12CD34")}
            aria-label={t("Cod de invitație", "Invite code")}
          />
          <Button type="submit" variant="secondary" icon={Search} busy={lookingUp} className="shrink-0">
            <Text ro="Caută" en="Preview" />
          </Button>
        </form>

        <label className="flex items-center gap-2.5 rounded-md bg-inner px-3.5 py-2.5 text-sm text-soft">
          <input
            type="checkbox"
            checked={shareNutrition}
            onChange={(e) => setShareNutrition(e.target.checked)}
            className="size-4 accent-[var(--lime)]"
          />
          <Text
            ro="Partajează jurnalul alimentar și obiectivele calorice cu antrenorul (poți schimba oricând)"
            en="Share nutrition diary and calorie targets with the coach (changeable anytime)"
          />
        </label>

        {inviteError && <Message>{inviteError}</Message>}

        {invitePreview && (
          <div className="flex flex-col gap-3 rounded-lg border border-lime-border bg-lime-soft p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-lime-text">
                  <Text ro="Program găsit prin cod" en="Program found by code" />
                </p>
                <h3 className="text-xl font-bold text-foreground">{invitePreview.title}</h3>
                <p className="text-sm text-soft">
                  {t("Antrenor", "Coach")}: <span className="font-semibold text-foreground">{invitePreview.coach_name}</span>
                </p>
              </div>
              <Badge tone={invitePreview.requires_approval ? "gold" : "lime"}>
                {invitePreview.requires_approval
                  ? t("Necesită aprobare", "Approval required")
                  : t("Înscriere instant", "Instant enroll")}
              </Badge>
            </div>
            {invitePreview.description && (
              <p className="text-sm text-soft">{invitePreview.description}</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="ice">{goalLabel(invitePreview.goal, t)}</Badge>
              <Badge>{difficultyLabel(invitePreview.difficulty, t)}</Badge>
              <Badge>{invitePreview.duration_weeks} {t("săpt.", "wk")}</Badge>
            </div>
            <div className="pt-1">
              {renderProgramActions(invitePreview, inviteCode)}
            </div>
          </div>
        )}
      </Card>

      {/* 2. My Enrollments */}
      {myEnrollments.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="pl-0.5 text-[15px] font-semibold text-soft">
            <Text ro="Înscrierile tale" en="Your enrollments" />
          </h2>
          <Columns>
            {myEnrollments.map((item) => (
              <Card key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold">{item.program_title}</h3>
                    <p className="text-xs text-muted">
                      {t("Antrenor", "Coach")}: {item.coach_name} · {t("Săpt.", "Wk")} {item.current_week}
                    </p>
                  </div>
                  <Badge tone={item.status === "active" ? "lime" : item.status === "pending" ? "gold" : undefined}>
                    {enrollmentStatusLabel(item.status, t)}
                  </Badge>
                </div>

                {(item.status === "active" || item.status === "pending" || item.status === "paused") && (
                  <label className="flex items-center gap-2.5 rounded-md bg-inner px-3 py-2 text-xs font-medium text-soft">
                    <input
                      type="checkbox"
                      checked={item.share_nutrition}
                      disabled={busyKey === `nutr-${item.id}`}
                      onChange={(e) => void handleToggleNutrition(item.id, e.target.checked)}
                      className="size-4 accent-[var(--lime)]"
                    />
                    <Text ro="Partajează nutriția cu antrenorul" en="Share nutrition with coach" />
                  </label>
                )}

                <div className="flex flex-wrap gap-2">
                  {item.status === "active" && (
                    <Link
                      href={
                        item.next_workout_id
                          ? `/insert?programWorkoutId=${item.next_workout_id}&enrollmentId=${item.id}`
                          : "/insert"
                      }
                      className="inline-flex min-h-10 items-center justify-center rounded-full bg-lime px-4 text-sm font-semibold text-on-solid"
                    >
                      <Text ro="Pornește antrenamentul" en="Start workout" />
                    </Link>
                  )}
                  {item.status === "pending" && (
                    <Button
                      variant="soft"
                      tone="red"
                      small
                      icon={X}
                      busy={busyKey === `cancel-${item.id}`}
                      onClick={() => handleCancelPending(item.id)}
                    >
                      <Text ro="Anulează cererea" en="Cancel request" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </Columns>
        </section>
      )}

      {/* 3. Public Programs Directory */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="pl-0.5 text-[15px] font-semibold text-soft">
            <Text ro="Programe publice" en="Public programs" /> ({filteredPrograms.length})
          </h2>
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-[320px]">
            <Select
              title={t("Obiectiv", "Goal")}
              value={goalFilter}
              onChange={setGoalFilter}
              options={[
                { value: "all", label: t("Toate obiectivele", "All goals") },
                ...PROGRAM_GOALS.map((g) => ({ value: g, label: goalLabel(g, t) })),
              ]}
            />
            <Select
              title={t("Dificultate", "Difficulty")}
              value={difficultyFilter}
              onChange={setDifficultyFilter}
              options={[
                { value: "all", label: t("Toate nivelurile", "All levels") },
                ...PROGRAM_DIFFICULTIES.map((d) => ({ value: d, label: difficultyLabel(d, t) })),
              ]}
            />
          </div>
        </div>

        {filteredPrograms.length === 0 ? (
          <Empty icon={Sparkles}>
            <Text
              ro="Nu există programe publice care să corespundă filtrelor."
              en="No public programs match your filters."
            />
          </Empty>
        ) : (
          <Columns>
            {filteredPrograms.map((program) => (
              <Card key={program.id}>
                <div className="flex flex-col gap-1">
                  <h3 className="text-[20px] font-semibold tracking-[-0.4px]">{program.title}</h3>
                  <p className="text-xs text-muted">
                    {t("Antrenor", "Coach")}: <span className="font-semibold text-soft">{program.coach_name}</span>
                  </p>
                </div>
                {program.description && (
                  <p className="line-clamp-3 text-sm text-soft">{program.description}</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="ice">{goalLabel(program.goal, t)}</Badge>
                  <Badge>{difficultyLabel(program.difficulty, t)}</Badge>
                  <Badge>{program.duration_weeks} {t("săpt.", "wk")}</Badge>
                  <Badge>{program.workout_count} {t("zile", "days")}</Badge>
                  {program.requires_approval && (
                    <Badge tone="gold"><Text ro="Cu aprobare" en="Approval" /></Badge>
                  )}
                </div>
                <div className="pt-1">
                  {renderProgramActions(program)}
                </div>
              </Card>
            ))}
          </Columns>
        )}
      </section>

      {/* 4. Public Coaches Directory */}
      {publicCoaches.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="pl-0.5 text-[15px] font-semibold text-soft">
            <Text ro="Antrenori" en="Coaches" />
          </h2>
          <Columns>
            {publicCoaches.map((coach) => (
              <Card key={coach.user_id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-9 items-center justify-center rounded-full bg-lime-soft text-lime-text">
                      <Award className="size-4" />
                    </span>
                    <h3 className="text-lg font-semibold">{coach.display_name}</h3>
                  </div>
                  <Badge tone={coach.accepting_clients ? "lime" : undefined}>
                    {coach.accepting_clients
                      ? t("Acceptă clienți", "Accepting clients")
                      : t("Listă plină", "Full")}
                  </Badge>
                </div>
                {coach.bio && <p className="text-sm text-soft">{coach.bio}</p>}
                {coach.specialties.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {coach.specialties.map((spec) => (
                      <Badge key={spec}>{spec}</Badge>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </Columns>
        </section>
      )}
    </div>
  );
}
