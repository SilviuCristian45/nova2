// app/components/goal-setting.tsx
"use client";

import { Text, useLanguage } from "@/app/components/language-provider"
import { useState } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { IconButton, Input, Label } from "./ui";
import { updateDailyGoal } from "../profiles/profile";

interface GoalSettingProps {
  currentGoal: number;
}

export default function GoalSetting({ currentGoal }: GoalSettingProps) {
  const { t, locale } = useLanguage()

  const [isEditing, setIsEditing] = useState(false);
  const [goal, setGoal] = useState(currentGoal.toString());
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const formattedGoal = currentGoal.toLocaleString(locale);

  async function handleSave() {
    const newGoal = parseInt(goal, 10);
    if (isNaN(newGoal) || newGoal <= 0) {
      setMessage(t("Invalid", "Invalid"));
      setTimeout(() => setMessage(null), 2000);
      return;
    }

    if (newGoal === currentGoal) {
      setIsEditing(false);
      return;
    }

    setIsPending(true);
    const formData = new FormData();
    formData.append("dailyGoal", goal);

    const result = await updateDailyGoal(formData);

    if (result?.error) {
      setMessage(t("Eroare", "Error"));
    } else {
      setIsEditing(false);
      setMessage(null);
    }
    setIsPending(false);
  }

  function handleCancel() {
    setGoal(currentGoal.toString());
    setIsEditing(false);
    setMessage(null);
  }

  return (
    <section className="flex items-center gap-3 rounded-lg bg-card px-[18px] py-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Label htmlFor="daily-goal"><Text ro="Obiectiv zilnic" en="Daily goal" /></Label>
        {isEditing ? (
          <Input id="daily-goal" type="text" inputMode="numeric" value={goal} autoFocus
            onChange={(e) => setGoal(e.target.value)} className="max-w-40" />
        ) : (
          <span className="text-[20px] font-semibold tracking-[-0.4px] tabular-nums">
            {formattedGoal}{" "}
            <span className="text-sm font-normal text-muted"><Text ro="pași" en="steps" /></span>
          </span>
        )}
      </div>
      {message && <span role="alert" className="text-xs font-semibold text-red-text">{message}</span>}
      {isEditing ? (
        <>
          <IconButton icon={isPending ? Loader2 : Check} tone="lime" label={t("Salvează obiectivul", "Save goal")} onClick={handleSave} disabled={isPending} />
          <IconButton icon={X} label={t("Anulează", "Cancel")} onClick={handleCancel} disabled={isPending} />
        </>
      ) : (
        <IconButton icon={Pencil} label={t("Editează obiectivul", "Edit goal")} onClick={() => { setGoal(currentGoal.toString()); setIsEditing(true); }} />
      )}
    </section>
  );
}
