// app/components/steps-input.tsx
"use client";

import { useLanguage } from "@/app/components/language-provider"
import { useState } from "react";
import { Save, Loader2, Footprints } from "lucide-react";
import { saveDailySteps } from "../steps/steps";
import { saveOfflineMutation, useOffline } from "@/lib/offline/client";

interface StepsInputProps {
  initialSteps: number;
  date: string;
}

export default function StepsInput({ initialSteps, date }: StepsInputProps) {
  const { t } = useLanguage()
  const { ownerId, snapshot } = useOffline();

  const [steps, setSteps] = useState(initialSteps.toString());
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const storedSteps = snapshot?.steps.find((entry) => entry.date === date)?.steps ?? initialSteps;
  const hasChanged = Number(steps) !== storedSteps;

  async function handleSubmit() {
    if (!hasChanged || isPending) return;
    setIsPending(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("date", date);
    formData.append("steps", steps);

    try {
      if (!steps.trim() || !Number.isSafeInteger(Number(steps)) || Number(steps) < 0) throw new Error(t("Număr de pași invalid.", "Invalid step count."));
      if (ownerId) {
        await saveOfflineMutation({ kind: "steps", date, steps: Number(steps) }, ownerId);
        setMessage(t("Salvat pe dispozitiv; sincronizarea este în așteptare.", "Saved to device; awaiting sync."));
      } else {
        const result = await saveDailySteps(formData);
        if (result?.error) setMessage(`❌ ${result.error}`);
        else setMessage(t("✅ Salvat", "✅ Saved"));
      }
    } catch (error) {
      setMessage(`❌ ${error instanceof Error ? error.message : t("Salvarea a eșuat.", "Save failed.")}`);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 relative">
        <Footprints className="absolute left-4 top-3.5 size-5 text-emerald-700 dark:text-emerald-500" />
        <input
          type="number"
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          placeholder={t("0 pași", "0 steps")}
          className="h-12 w-full pl-12 pr-14 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 text-lg font-bold focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all shadow-inner"
        />

        {hasChanged && (
          <button
            aria-label={t("Salvează pașii", "Save steps")}
            onClick={handleSubmit}
            disabled={isPending}
            className="absolute right-2 top-2 size-8 flex items-center justify-center rounded-lg bg-emerald-500 text-white dark:text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 transition-all active:scale-95"
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
          </button>
        )}
      </div>
      {message && (
        <p
          className={`text-xs font-bold pl-2 ${message.startsWith("❌") ? "text-red-700 dark:text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
