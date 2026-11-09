// app/components/steps-input.tsx
"use client";

import { useLanguage } from "@/app/components/language-provider"
import { useState } from "react";
import { saveDailySteps } from "../steps/steps";
import { saveOfflineMutation, useOffline } from "@/lib/offline/client";
import { Button, Card, Label, ProgressBar, TextLink, cx } from "@/app/components/ui";

interface StepsInputProps {
  initialSteps: number;
  date: string;
  goal: number;
}

// Today's steps: the big figure is the input itself; Save appears only once the value changes.
export default function StepsInput({ initialSteps, date, goal }: StepsInputProps) {
  const { t, locale } = useLanguage()
  const { ownerId, snapshot } = useOffline();

  const [steps, setSteps] = useState(initialSteps.toString());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const storedSteps = snapshot?.steps.find((entry) => entry.date === date)?.steps ?? initialSteps;
  const hasChanged = Number(steps) !== storedSteps;
  const achieved = storedSteps >= goal;

  async function handleSubmit() {
    if (!hasChanged) return;
    setMessage(null);

    const formData = new FormData();
    formData.append("date", date);
    formData.append("steps", steps);

    try {
      if (!steps.trim() || !Number.isSafeInteger(Number(steps)) || Number(steps) < 0) throw new Error(t("Număr de pași invalid.", "Invalid step count."));
      if (ownerId) {
        await saveOfflineMutation({ kind: "steps", date, steps: Number(steps) }, ownerId);
        setMessage({ ok: true, text: t("Salvat pe dispozitiv; sincronizarea este în așteptare.", "Saved to device; awaiting sync.") });
      } else {
        const result = await saveDailySteps(formData);
        if (result?.error) setMessage({ ok: false, text: result.error });
        else setMessage({ ok: true, text: t("Salvat", "Saved") });
      }
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : t("Salvarea a eșuat.", "Save failed.") });
    }
  }

  return (
    <Card aria-labelledby="daily-steps-title">
      <div className="flex items-center justify-between gap-3">
        <Label id="daily-steps-title" htmlFor="daily-steps">{t("Pași azi", "Steps today")}</Label>
        <TextLink href="/stats?mode=steps">{t("Grafic", "Chart")}</TextLink>
      </div>
      <div className="flex items-baseline gap-2">
        <input id="daily-steps" type="text" inputMode="numeric" autoComplete="off" value={steps} placeholder="0"
          onChange={(e) => { setSteps(e.target.value); setMessage(null); }}
          className="w-0 min-w-0 flex-1 bg-transparent p-0 text-[44px] font-bold leading-none tracking-[-1.5px] tabular-nums outline-none focus-visible:outline-none" />
        <span className="text-[15px] text-muted tabular-nums">/ {goal.toLocaleString(locale)}</span>
      </div>
      <ProgressBar value={(storedSteps / goal) * 100} tone={achieved ? "lime" : "gold"} />
      {(hasChanged || message) && (
        <div className="flex min-h-10 items-center justify-between gap-3">
          {message ? <p role={message.ok ? "status" : "alert"} className={cx("text-[13px] font-semibold", message.ok ? "text-lime-text" : "text-red-text")}>{message.text}</p> : <span />}
          {hasChanged && <Button small onClick={handleSubmit}>{t("Salvează", "Save")}</Button>}
        </div>
      )}
    </Card>
  );
}
