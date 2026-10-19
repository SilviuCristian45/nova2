"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { Scale, Loader2, Save, TrendingUp } from "lucide-react";
import { getDailyWeight, saveDailyWeight } from "@/app/weight/actions";
import { isMeasurementDate, localDate, parseBodyWeight } from "@/lib/daily-metrics";
import { useLanguage } from "./language-provider";
import { saveOfflineMutation, useOffline } from "@/lib/offline/client";
import { readOfflineDatabase } from "@/lib/offline/store";

const subscribeToDate = () => () => {};
const serverDate = () => "";

export default function WeightInput() {
  const { t } = useLanguage();
  const { ownerId } = useOffline();
  const today = useSyncExternalStore(subscribeToDate, localDate, serverDate);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const date = selectedDate ?? today;
  const [weight, setWeight] = useState("");
  const [savedWeight, setSavedWeight] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedDate, setLoadedDate] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(0);

  function errorText(code: string) {
    switch (code) {
      case "unauthorized": return t("Sesiune expirată. Autentifică-te din nou.", "Session expired. Please sign in again.");
      case "invalid-date": return t("Alege o dată validă, cel târziu azi.", "Choose a valid date no later than today.");
      case "invalid-weight": return t("Introdu o greutate pozitivă în kg, cu cel mult două zecimale.", "Enter a positive weight in kg with up to two decimal places.");
      case "setup": return t("Urmărirea greutății necesită migrarea bazei de date. Consultă README.", "Weight tracking requires the database migration. See README.");
      default: return t("Nu am putut salva sau încărca greutatea. Reîncearcă.", "Unable to save or load your weight. Please retry.");
    }
  }

  useEffect(() => {
    if (!date && selectedDate === null) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setLoadFailed(false);
      setSaved(false);
      setWeight("");
      setSavedWeight(null);
      if (!isMeasurementDate(date)) {
        setError("invalid-date");
        setLoadFailed(true);
        setLoading(false);
        setLoadedDate(date);
        return;
      }
      try {
        if (ownerId) {
          const state = await readOfflineDatabase();
          if (cancelled) return;
          if (state.activeOwner !== ownerId) throw new Error("Account changed.");
          const entry = state.accounts[ownerId]?.snapshot.weights.find((row) => row.date === date);
          setSavedWeight(entry?.weight_kg ?? null);
          setWeight(entry ? String(entry.weight_kg) : "");
          return;
        }
        const result = await getDailyWeight(date);
        if (cancelled) return;
        if (!result.success) {
          setError(result.error);
          setLoadFailed(true);
        }
        else {
          setSavedWeight(result.weight);
          setWeight(result.weight === null ? "" : String(result.weight));
        }
      } catch {
        if (!cancelled) {
          setError("storage");
          setLoadFailed(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadedDate(date);
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [date, retry, selectedDate, ownerId]);

  const parsedWeight = parseBodyWeight(weight);
  const changed = parsedWeight !== null && parsedWeight !== savedWeight;
  const blocked = loadFailed;
  const isLoading = loading || loadedDate !== date;

  function submit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        if (ownerId) {
          const value = parseBodyWeight(formData.get("weight"));
          if (value === null) { setError("invalid-weight"); return; }
          await saveOfflineMutation({ kind: "weight", date, weightKg: value }, ownerId);
          setSavedWeight(value);
          setSaved(true);
          return;
        }
        const result = await saveDailyWeight(formData);
        if (!result.success) setError(result.error);
        else {
          setSavedWeight(result.weight);
          setSaved(true);
        }
      } catch {
        setError("storage");
      }
    });
  }

  return (
    <section aria-labelledby="body-weight-title" className="rounded-2xl border border-secondary bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="body-weight-title" className="flex items-center gap-2 font-bold">
          <Scale className="size-5 text-cyan-700 dark:text-cyan-400" />
          {t("Greutate corporală", "Body weight")}
        </h2>
        <Link href="/stats?mode=weight" className="flex items-center gap-1.5 text-sm font-semibold text-cyan-700 dark:text-cyan-400">
          <TrendingUp className="size-4" />{t("Vezi graficul", "View chart")}
        </Link>
      </div>
      <form action={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="weight-date" className="text-xs font-semibold text-muted-foreground">{t("Data", "Date")}</label>
          <input id="weight-date" name="date" type="date" required value={date}
            min="0001-01-01" max={today || undefined} disabled={pending}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="h-12 min-w-0 w-full rounded-xl border border-secondary bg-background px-3 text-sm" />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="body-weight" className="text-xs font-semibold text-muted-foreground">{t("Greutate (kg)", "Weight (kg)")}</label>
          <input id="body-weight" name="weight" type="text" inputMode="decimal" required
            autoComplete="off" value={weight} placeholder="75.5"
            disabled={pending || isLoading || blocked}
            onChange={(event) => { setWeight(event.target.value); setSaved(false); if (error === "invalid-weight") setError(null); }}
            className="h-12 min-w-0 w-full rounded-xl border border-secondary bg-background px-3 text-lg font-bold disabled:opacity-50" />
        </div>
        <button type="submit" disabled={pending || isLoading || !changed || blocked}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {t("Salvează", "Save")}
        </button>
      </form>
      {isLoading && <p role="status" className="mt-3 text-sm text-muted-foreground">{t("Se încarcă...", "Loading...")}</p>}
      {!isLoading && !error && savedWeight === null && <p className="mt-3 text-xs text-muted-foreground">{t("Nicio cântărire pentru această zi. Introdu valoarea în kg.", "No weigh-in for this day. Enter your weight in kg.")}</p>}
      {weight && parsedWeight === null && <p className="mt-3 text-xs text-red-700 dark:text-red-400">{errorText("invalid-weight")}</p>}
      {saved && <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{ownerId ? t("Salvat pe dispozitiv; verifică starea sincronizării.", "Saved to device; check sync status.") : t("Greutatea a fost salvată.", "Weight saved.")}</p>}
      {error && <div role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
        <p>{errorText(error)}</p>
        {loadFailed && <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-2 font-bold underline">{t("Reîncearcă", "Retry")}</button>}
      </div>}
      <p className="mt-3 text-xs text-muted-foreground">{t("O valoare pe zi. O nouă salvare actualizează valoarea din ziua selectată.", "One entry per day. Saving again updates the selected day's entry.")}</p>
    </section>
  );
}
