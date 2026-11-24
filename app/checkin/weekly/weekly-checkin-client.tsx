"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Send } from "lucide-react";
import { Text, useLanguage } from "@/app/components/language-provider";
import { useUnits } from "@/app/components/units-provider";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Field,
  Input,
  Message,
  Select,
  Textarea,
} from "@/app/components/ui";
import type { WeeklyCheckin } from "@/lib/coach/types";
import { submitWeeklyCheckinAction } from "./actions";

export type ActiveCoachOption = {
  coachId: string;
  coachName: string;
  enrollmentId: string;
  programTitle: string | null;
};

function ScorePicker({
  label,
  value,
  onChange,
  disabled,
}: {
  label: React.ReactNode;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="pl-0.5 text-[13px] font-medium text-muted">{label}</span>
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((score) => {
          const active = value === score;
          return (
            <button
              key={score}
              type="button"
              disabled={disabled}
              onClick={() => onChange(score)}
              className={`min-h-12 rounded-md text-base font-bold tabular-nums transition-colors disabled:opacity-50 ${
                active ? "bg-lime text-on-solid" : "bg-inner text-soft active:bg-control"
              }`}
            >
              {score}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WeeklyCheckinClient({
  weekStart,
  coaches,
  latestWeightKg,
  history,
}: {
  weekStart: string;
  coaches: ActiveCoachOption[];
  latestWeightKg: number | null;
  history: WeeklyCheckin[];
}) {
  const router = useRouter();
  const { t, locale } = useLanguage();
  const { unit, toUnit, toKg, format } = useUnits();

  const [selectedCoachId, setSelectedCoachId] = useState(coaches[0]?.coachId ?? "");
  const activeCoach = coaches.find((c) => c.coachId === selectedCoachId) ?? coaches[0];
  const currentWeekEntry = history.find(
    (item) => item.coach_id === activeCoach?.coachId && item.week_start === weekStart,
  ) ?? null;

  const isReviewed = Boolean(currentWeekEntry?.reviewed_at);

  const initialWeight = currentWeekEntry?.weight_kg ?? latestWeightKg;
  const [weightInput, setWeightInput] = useState(
    initialWeight !== null ? String(Number(toUnit(Number(initialWeight)).toFixed(2))) : "",
  );
  const [energy, setEnergy] = useState(currentWeekEntry?.energy ?? 4);
  const [sleep, setSleep] = useState(currentWeekEntry?.sleep ?? 4);
  const [stress, setStress] = useState(currentWeekEntry?.stress ?? 2);
  const [notes, setNotes] = useState(currentWeekEntry?.client_notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function switchCoach(nextCoachId: string) {
    setSelectedCoachId(nextCoachId);
    const entry = history.find((item) => item.coach_id === nextCoachId && item.week_start === weekStart) ?? null;
    const w = entry?.weight_kg ?? latestWeightKg;
    setWeightInput(w !== null ? String(Number(toUnit(Number(w)).toFixed(2))) : "");
    setEnergy(entry?.energy ?? 4);
    setSleep(entry?.sleep ?? 4);
    setStress(entry?.stress ?? 2);
    setNotes(entry?.client_notes ?? "");
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCoach) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const parsedWeight = weightInput.trim() === "" ? null : Number(weightInput.trim().replace(",", "."));
    if (parsedWeight !== null && (!Number.isFinite(parsedWeight) || parsedWeight <= 0)) {
      setError(t("Introdu o greutate validă.", "Please enter a valid weight."));
      setSubmitting(false);
      return;
    }

    try {
      const res = await submitWeeklyCheckinAction({
        coachId: activeCoach.coachId,
        enrollmentId: activeCoach.enrollmentId,
        weekStart,
        weightKg: parsedWeight === null ? null : toKg(parsedWeight),
        energy,
        sleep,
        stress,
        clientNotes: notes,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setSuccess(res.message ?? t("Salvat.", "Saved."));
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const weekLabel = new Date(`${weekStart}T00:00:00`).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const coachHistory = history.filter((item) => item.coach_id === activeCoach?.coachId);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle
            description={
              <Text
                ro={`Săptămâna începută pe ${weekLabel}. Durează sub 1 minut și ajunge direct în dashboard-ul antrenorului.`}
                en={`Week starting ${weekLabel}. Takes under 1 minute and goes straight to your coach's dashboard.`}
              />
            }
          >
            <Text ro="Check-in săptămânal" en="Weekly check-in" />
          </CardTitle>
          {isReviewed ? (
            <Badge tone="lime" className="gap-1">
              <CheckCircle2 className="size-3" />
              <Text ro="Revizuit de antrenor" en="Reviewed by coach" />
            </Badge>
          ) : currentWeekEntry ? (
            <Badge tone="gold" className="gap-1">
              <Clock className="size-3" />
              <Text ro="Trimis · editabil" en="Submitted · editable" />
            </Badge>
          ) : (
            <Badge tone="ice"><Text ro="Nou" en="Due" /></Badge>
          )}
        </div>

        {coaches.length > 1 && (
          <Field label={<Text ro="Antrenor" en="Coach" />}>
            <Select
              title={t("Selectează antrenorul", "Select coach")}
              value={selectedCoachId}
              onChange={switchCoach}
              options={coaches.map((c) => ({
                value: c.coachId,
                label: c.coachName,
                subtitle: c.programTitle ?? undefined,
              }))}
            />
          </Field>
        )}

        {isReviewed && currentWeekEntry?.coach_reply && (
          <div className="flex flex-col gap-1.5 rounded-md border border-lime-border bg-lime-soft p-3.5">
            <span className="text-xs font-bold uppercase tracking-wide text-lime-text">
              {t("Răspunsul antrenorului", "Coach's reply")} ({activeCoach?.coachName})
            </span>
            <p className="whitespace-pre-wrap text-sm font-medium text-foreground">
              {currentWeekEntry.coach_reply}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field
            label={`${t("Greutate curentă", "Current weight")} (${unit})`}
            htmlFor="weekly-weight"
          >
            <Input
              id="weekly-weight"
              type="text"
              inputMode="decimal"
              disabled={isReviewed}
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              placeholder={t("Pre-completat din ultima cântărire", "Pre-filled from latest weigh-in")}
            />
          </Field>

          <ScorePicker
            label={<Text ro="Energie (1 = epuizat, 5 = excelent)" en="Energy (1 = exhausted, 5 = great)" />}
            value={energy}
            onChange={setEnergy}
            disabled={isReviewed}
          />
          <ScorePicker
            label={<Text ro="Calitate somn (1 = slab, 5 = odihnitor)" en="Sleep quality (1 = poor, 5 = restful)" />}
            value={sleep}
            onChange={setSleep}
            disabled={isReviewed}
          />
          <ScorePicker
            label={<Text ro="Nivel stres (1 = scăzut, 5 = foarte ridicat)" en="Stress level (1 = low, 5 = very high)" />}
            value={stress}
            onChange={setStress}
            disabled={isReviewed}
          />

          <Field label={<Text ro="Note pentru antrenor (opțional)" en="Notes for your coach (optional)" />} htmlFor="weekly-notes">
            <Textarea
              id="weekly-notes"
              disabled={isReviewed}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1500}
              placeholder={t(
                "Cum au mers antrenamentele, recuperare, dureri, program săptămâna viitoare...",
                "How training felt, recovery, aches, schedule for next week...",
              )}
            />
          </Field>

          {error && <Message>{error}</Message>}
          {success && <Message tone="lime">{success}</Message>}

          {!isReviewed && (
            <Button type="submit" icon={Send} busy={submitting}>
              {currentWeekEntry ? (
                <Text ro="Actualizează check-in-ul" en="Update check-in" />
              ) : (
                <Text ro="Trimite check-in-ul" en="Submit check-in" />
              )}
            </Button>
          )}
        </form>
      </Card>

      {coachHistory.length > 0 && (
        <Card>
          <CardTitle>
            <Text ro="Istoric check-in-uri săptămânale" en="Weekly check-in history" />
          </CardTitle>
          <div className="flex flex-col gap-3">
            {coachHistory.map((item) => (
              <div key={item.id} className="flex flex-col gap-2 rounded-md bg-inner p-3.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {t("Săptămâna", "Week")}{" "}
                    {new Date(`${item.week_start}T00:00:00`).toLocaleDateString(locale, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {item.weight_kg !== null && <Badge>{format(Number(item.weight_kg))}</Badge>}
                    <Badge tone="lime">{t("En.", "En.")} {item.energy}/5</Badge>
                    <Badge tone="ice">{t("Somn", "Sleep")} {item.sleep}/5</Badge>
                    <Badge tone="coral">{t("Stres", "Stress")} {item.stress}/5</Badge>
                  </div>
                </div>
                {item.client_notes && <p className="text-xs text-soft">{item.client_notes}</p>}
                {item.coach_reply ? (
                  <div className="rounded-sm border border-lime-border bg-lime-soft px-3 py-2 text-xs">
                    <p className="font-bold text-lime-text"><Text ro="Răspuns antrenor:" en="Coach reply:" /></p>
                    <p className="mt-0.5 whitespace-pre-wrap text-foreground">{item.coach_reply}</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted">
                    <Text ro="În așteptarea răspunsului antrenorului." en="Awaiting coach response." />
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
