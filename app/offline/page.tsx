"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { ArrowLeft, CloudOff, Dumbbell, Footprints, Heart, RefreshCw, Scale, Trash2 } from "lucide-react";
import { useLanguage } from "@/app/components/language-provider";
import { WorkoutLabel } from "@/app/components/workout-label";
import { isMeasurementDate, localDate, parseBodyWeight } from "@/lib/daily-metrics";
import { saveOfflineMutation, useOffline } from "@/lib/offline/client";
import type { OfflineCardio, OfflinePayload, OfflineSet, OfflineSnapshot } from "@/lib/offline/types";
import { CARDIO_ACTIVITIES, EXERCISES, SET_TYPES, SPLITS } from "@/lib/workout-data";

const inputClass = "h-11 w-full min-w-0 rounded-xl border bg-background px-3 text-sm";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50";
const panelClass = "min-w-0 rounded-2xl border bg-card p-4 shadow-sm sm:p-6";
type LocalSet = OfflineSet & { uiId: string };
type LocalCardio = OfflineCardio & { uiId: string };

function failureMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function OfflinePage() {
  const { t, locale } = useLanguage();
  const { ready, ownerId, online, syncing, pending, error, snapshot, sync, forget } = useOffline();
  const [actionError, setActionError] = useState<string | null>(null);
  const [forgetting, setForgetting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const activeSnapshot = ownerId && snapshot?.ownerId === ownerId ? snapshot : null;

  async function retry() {
    setActionError(null);
    setRetrying(true);
    try {
      await sync();
    } catch (error) {
      setActionError(failureMessage(error, t("Sincronizarea a eșuat.", "Sync failed.")));
    } finally {
      setRetrying(false);
    }
  }

  async function forgetData() {
    if (!window.confirm(t(
      "Ștergi datele offline de pe acest dispozitiv? Toate înregistrările nesincronizate vor fi pierdute. Datele deja sincronizate rămân în cont.",
      "Remove offline data from this device? All unsynced entries will be lost. Already synced data stays in your account.",
    ))) return;
    setActionError(null);
    setForgetting(true);
    try {
      await forget();
    } catch (error) {
      setActionError(failureMessage(error, t("Ștergerea locală a eșuat.", "Could not remove local data.")));
    } finally {
      setForgetting(false);
    }
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-6xl space-y-6 bg-background p-4 text-foreground sm:p-8">
      <header className="space-y-4">
        <Link href="/" prefetch={false} className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />{t("Înapoi la panoul online", "Back to online dashboard")}
        </Link>
        <div className="flex items-start gap-3">
          <CloudOff className="mt-1 size-7 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("Spațiul de lucru offline", "Offline workspace")}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t(
              "Înregistrează antrenamente, pași și greutate pe acest dispozitiv. Modificările salvate se sincronizează când conexiunea revine. Nutriția necesită conexiune la internet.",
              "Log workouts, steps and weight on this device. Saved changes sync when your connection returns. Nutrition requires an internet connection.",
            )}</p>
          </div>
        </div>
      </header>

      <section aria-label={t("Starea sincronizării", "Sync status")} className={panelClass}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              <span className={`rounded-full px-3 py-1 ${online ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-800 dark:text-amber-400"}`}>
                {!ready ? t("Se încarcă…", "Loading…") : online ? t("Conectat", "Online") : t("Fără conexiune", "Offline")}
              </span>
              {ready && <span>{pending.toLocaleString(locale)} {t("în așteptarea sincronizării", "queued for sync")}</span>}
            </div>
            {ready && <p className="text-sm text-muted-foreground">
              {syncing || retrying ? t("Sincronizare în curs…", "Syncing…") : pending > 0
                ? t("Înregistrările în așteptare sunt doar pe acest dispozitiv.", "Queued entries are only on this device.")
                : ownerId ? t("Nicio înregistrare în așteptare pe acest dispozitiv.", "No queued entries on this device.")
                  : t("Pregătește accesul offline din contul tău online.", "Set up offline access from your online account.")}
            </p>}
          </div>
          <button type="button" className={buttonClass} onClick={() => void retry()} disabled={!ready || !online || syncing || retrying || forgetting}>
            <RefreshCw className={`size-4 ${syncing || retrying ? "animate-spin" : ""}`} aria-hidden="true" />
            {error || actionError ? t("Reîncearcă sincronizarea", "Retry sync") : t("Sincronizează / descarcă", "Sync / download")}
          </button>
        </div>
        {(error || actionError) && <p role="alert" className="mt-4 break-words rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
          {t("Sincronizarea sau stocarea locală necesită atenție:", "Sync or local storage needs attention:")} {actionError || error}
        </p>}
        {activeSnapshot && <p className="mt-4 text-xs text-muted-foreground">
          {t("Ultima descărcare:", "Last downloaded:")}{" "}
          <time dateTime={activeSnapshot.downloadedAt}>{new Date(activeSnapshot.downloadedAt).toLocaleString(locale)}</time>
          {" · "}{t("Datele sunt afișate numai pentru contul activ.", "Only the active account’s data is shown.")}
        </p>}
      </section>

      {!ready ? <p role="status" className="py-8 text-center text-muted-foreground">{t("Se deschide spațiul local…", "Opening local workspace…")}</p>
        : !ownerId ? <section className={panelClass}>
          <h2 className="text-lg font-bold">{t("Este necesară o primă conectare online", "An initial online sign-in is required")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t(
            "Nu există un cont activ pregătit pentru acces offline. Conectează-te online și descarcă datele pentru acest dispozitiv înainte de a înregistra offline. Dacă te-ai deconectat sau ai schimbat contul, revino online pentru verificare.",
            "No active account is prepared for offline access. Sign in online and download data for this device before logging offline. If you signed out or changed accounts, reconnect online to verify your account.",
          )}</p>
          <Link href="/login" prefetch={false} className={`${buttonClass} mt-4`}>{t("Conectare online", "Sign in online")}</Link>
        </section>
          : <>
            <OwnerWorkspace key={ownerId} snapshot={activeSnapshot} disabled={forgetting} />
            <section className={`${panelClass} space-y-3`}>
              <h2 className="font-bold">{t("Date pe acest dispozitiv", "Data on this device")}</h2>
              <p className="text-sm text-muted-foreground">{t(
                "Datele offline pot fi accesibile altor persoane care folosesc acest browser. Ștergerea lor elimină și înregistrările nesincronizate; nu șterge datele deja salvate online.",
                "Offline data may be accessible to others using this browser. Removing it also discards unsynced entries; it does not delete data already saved online.",
              )}</p>
              <button type="button" onClick={() => void forgetData()} disabled={forgetting || syncing || retrying} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-500/30 px-4 text-sm font-semibold text-red-700 disabled:opacity-50 dark:text-red-400">
                <Trash2 className="size-4" aria-hidden="true" />{forgetting ? t("Se șterge…", "Removing…") : t("Șterge datele offline", "Remove offline data")}
              </button>
            </section>
          </>}
    </main>
  );
}

function OwnerWorkspace({ snapshot, disabled }: { snapshot: OfflineSnapshot | null; disabled: boolean }) {
  const { t, locale } = useLanguage();
  return (
    <>
      <div className="grid items-start gap-5 md:grid-cols-2">
        <MetricForm kind="steps" snapshot={snapshot} disabled={disabled} />
        <MetricForm kind="weight" snapshot={snapshot} disabled={disabled} />
      </div>
      <WorkoutForm disabled={disabled} />
      <section className={`${panelClass} space-y-4`}>
        <div>
          <h2 className="text-xl font-bold">{t("Istoric descărcat · ultimele 90 de zile", "Downloaded history · last 90 days")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t(
            "Include antrenamentele salvate local în așteptarea sincronizării. Editarea și ștergerea antrenamentelor nu sunt disponibile offline; folosește istoricul online după sincronizare.",
            "Includes locally saved workouts awaiting sync. Editing and deleting workouts are not supported offline; use online history after syncing.",
          )}</p>
        </div>
        {!snapshot ? <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">{t(
          "Istoricul nu a fost descărcat încă. Revino online și folosește Sincronizează / descarcă.",
          "History has not been downloaded yet. Reconnect and use Sync / download.",
        )}</p> : !snapshot.workouts.length ? <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">{t(
          "Descărcarea este disponibilă, dar nu există antrenamente în această perioadă.",
          "Downloaded data is available, but there are no workouts in this period.",
        )}</p> : <div className="space-y-3">
          {snapshot.workouts.map((workout) => (
            <details key={workout.id} className="min-w-0 overflow-hidden rounded-xl border">
              <summary className="cursor-pointer space-y-1 p-4 marker:text-primary">
                <span className="ml-1 font-semibold">{new Date(`${workout.performed_on}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}{" · "}
                  {workout.workout_mode === "cardio" ? t("Cardio", "Cardio") : <WorkoutLabel value={workout.split} />}
                </span>
                {workout.pending && <span className="ml-2 inline-block rounded-full bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-800 dark:text-amber-400">{t("Nesincronizat", "Pending sync")}</span>}
                <span className="mt-1 block text-xs text-muted-foreground">{workout.workout_sets.length} {t("seturi", "sets")}{" · "}{workout.cardio_sessions.length} {t("activități cardio", "cardio entries")}{" · "}{t("Deschide detaliile", "Expand details")}</span>
              </summary>
              <div className="space-y-3 border-t bg-secondary/10 p-4">
                {workout.workout_sets.map((set) => <div key={set.id} className="space-y-1 rounded-xl border bg-background p-3 text-sm">
                  <p className="break-words font-semibold">{set.exercise}</p>
                  <p className="text-muted-foreground">{t("Set", "Set")} {set.set_number}{" · "}<WorkoutLabel value={set.set_type} /></p>
                  <p>{set.weight.toLocaleString(locale)} kg × {set.reps.toLocaleString(locale)} {t("repetări", "reps")}{" · RIR "}{set.rir.toLocaleString(locale)}</p>
                  {set.notes && <p className="whitespace-pre-wrap break-words text-muted-foreground">{set.notes}</p>}
                </div>)}
                {workout.cardio_sessions.map((entry) => <div key={entry.id} className="rounded-xl border bg-background p-3 text-sm">
                  <p className="break-words font-semibold">{entry.activity}</p>
                  <p className="mt-1 text-muted-foreground">{entry.duration_min.toLocaleString(locale)} min</p>
                </div>)}
                {!workout.workout_sets.length && !workout.cardio_sessions.length && <p className="text-sm text-muted-foreground">{t("Nu există detalii salvate pentru acest antrenament.", "No saved details for this workout.")}</p>}
              </div>
            </details>
          ))}
        </div>}
      </section>
    </>
  );
}

function MetricForm({ kind, snapshot, disabled }: { kind: "steps" | "weight"; snapshot: OfflineSnapshot | null; disabled: boolean }) {
  const { t, locale } = useLanguage();
  const { ownerId } = useOffline();
  const [date, setDate] = useState(localDate);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const existing = kind === "steps" ? snapshot?.steps.find((entry) => entry.date === date)?.steps : snapshot?.weights.find((entry) => entry.date === date)?.weight_kg;
  const value = draft[date] ?? (existing === undefined ? "" : String(existing));
  const title = kind === "steps" ? t("Pași", "Steps") : t("Greutate corporală", "Body weight");
  const Icon = kind === "steps" ? Footprints : Scale;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    setError(null);
    setSaved(false);
    if (!isMeasurementDate(date)) {
      setError(t("Alege o dată validă, nu în viitor.", "Choose a valid date, not in the future."));
      return;
    }
    const number = kind === "steps" ? Number(value) : parseBodyWeight(value);
    if (!value.trim() || number === null || !Number.isFinite(number) || (kind === "steps" && (!Number.isSafeInteger(number) || number < 0 || number > 2147483647))) {
      setError(kind === "steps" ? t("Introdu un număr întreg de pași, minimum 0.", "Enter a whole number of steps, at least 0.") : t("Introdu o greutate între 0,01 și 9999,99 kg, cu maximum două zecimale.", "Enter a weight between 0.01 and 9999.99 kg, with at most two decimals."));
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      if (!ownerId) throw new Error(t("Contul s-a schimbat.", "Account changed."));
      await saveOfflineMutation(kind === "steps" ? { kind, date, steps: number } : { kind, date, weightKg: number }, ownerId);
      setSaved(true);
    } catch (error) {
      setError(failureMessage(error, t("Salvarea a eșuat. Datele au fost păstrate.", "Save failed. Your input was kept.")));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <form onSubmit={submit} className={`${panelClass} space-y-4`}>
    <h2 className="flex items-center gap-2 text-lg font-bold"><Icon className="size-5" aria-hidden="true" />{title}</h2>
    <fieldset disabled={disabled || saving} className="space-y-4 disabled:opacity-60">
      <label className="block space-y-1 text-sm"><span>{t("Data", "Date")}</span><input aria-label={`${title}: ${t("data", "date")}`} className={inputClass} type="date" required min="0001-01-01" max={localDate()} value={date} onChange={(event) => { setDate(event.target.value); setSaved(false); setError(null); }} /></label>
      <label className="block space-y-1 text-sm"><span>{kind === "steps" ? t("Număr de pași", "Step count") : t("Greutate (kg)", "Weight (kg)")}</span><input className={inputClass} type="number" inputMode={kind === "steps" ? "numeric" : "decimal"} required min={kind === "steps" ? 0 : 0.01} max={kind === "steps" ? 2147483647 : 9999.99} step={kind === "steps" ? 1 : 0.01} value={value} onChange={(event) => { setDraft((current) => ({ ...current, [date]: event.target.value })); setSaved(false); }} /></label>
      <p className="text-xs text-muted-foreground">{existing === undefined
        ? t("Nicio valoare locală pentru această dată; câmpul gol nu înseamnă zero.", "No local value for this date; a blank field does not mean zero.")
        : `${t("Valoare locală:", "Local value:")} ${existing.toLocaleString(locale)}${kind === "weight" ? " kg" : ""}. ${t("Salvarea înlocuiește valoarea zilei.", "Saving replaces that day’s value.")}`}</p>
      <button className={buttonClass} type="submit">{saving ? t("Se salvează…", "Saving…") : t("Salvează pe dispozitiv", "Save on device")}</button>
    </fieldset>
    {error && <p role="alert" className="break-words text-sm text-red-700 dark:text-red-400">{error}</p>}
    {saved && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{t("Salvat pe dispozitiv și adăugat în coada de sincronizare. Starea de sus confirmă când coada este golită.", "Saved on this device and queued for sync. The status above confirms when the queue is empty.")}</p>}
  </form>;
}

function WorkoutForm({ disabled }: { disabled: boolean }) {
  const { ownerId } = useOffline();
  const { t, locale } = useLanguage();
  const [date, setDate] = useState(localDate);
  const [mode, setMode] = useState<"strength" | "cardio">("strength");
  const [split, setSplit] = useState<string>(SPLITS[0]);
  const [exercise, setExercise] = useState(EXERCISES[0]);
  const [setType, setSetType] = useState<string>("Working Set");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [rir, setRir] = useState("");
  const [notes, setNotes] = useState("");
  const [activity, setActivity] = useState(CARDIO_ACTIVITIES[0]);
  const [duration, setDuration] = useState("");
  const [sets, setSets] = useState<LocalSet[]>([]);
  const [cardio, setCardio] = useState<LocalCardio[]>([]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function addEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (mode === "strength") {
      const r = Number(reps), w = Number(weight), reserve = Number(rir);
      if (!reps.trim() || !weight.trim() || !rir.trim() || !Number.isSafeInteger(r) || r < 1 || r > 100000 || !Number.isFinite(w) || w < 0 || w > 99999 || !Number.isFinite(reserve) || reserve < 0 || reserve > 10) {
        setError(t("Repetările trebuie să fie întregi și pozitive, greutatea minimum 0, iar RIR între 0 și 10. Completează toate câmpurile numerice.", "Reps must be positive whole numbers, weight at least 0, and RIR between 0 and 10. Complete all numeric fields."));
        return;
      }
      setSets((current) => [...current, { uiId: crypto.randomUUID(), split, exercise, setNumber: current.filter((set) => set.exercise === exercise).length + 1, reps: r, weight: w, rir: reserve, setType, notes }]);
    } else {
      const minutes = Number(duration);
      if (!duration.trim() || !Number.isFinite(minutes) || minutes < 0.01 || minutes > 1440) {
        setError(t("Durata trebuie să fie între 0,01 și 1440 minute.", "Duration must be between 0.01 and 1440 minutes."));
        return;
      }
      setCardio((current) => [...current, { uiId: crypto.randomUUID(), activity, durationMin: minutes }]);
    }
  }

  async function save() {
    if (savingRef.current) return;
    setError(null);
    setSaved(false);
    if (!isMeasurementDate(date)) {
      setError(t("Alege o dată validă, nu în viitor.", "Choose a valid date, not in the future."));
      return;
    }
    if (mode === "strength" ? !sets.length : !cardio.length) {
      setError(t("Adaugă cel puțin un set sau o activitate înainte de salvare.", "Add at least one set or activity before saving."));
      return;
    }
    // Builder fields are not persisted until explicitly added to the workout.
    const payload: OfflinePayload = {
      kind: "workout", date, mode, split: mode === "strength" ? sets[0].split : "CARDIO",
      sets: mode === "strength" ? sets.map((set, index, all) => ({
        split: set.split, exercise: set.exercise, reps: set.reps, weight: set.weight,
        rir: set.rir, setType: set.setType, notes: set.notes,
        setNumber: all.slice(0, index + 1).filter((entry) => entry.exercise === set.exercise).length,
      })) : [],
      cardio: mode === "cardio" ? cardio.map(({ activity, durationMin }) => ({ activity, durationMin })) : [],
    };
    savingRef.current = true;
    setSaving(true);
    try {
      if (!ownerId) throw new Error(t("Contul s-a schimbat.", "Account changed."));
      await saveOfflineMutation(payload, ownerId);
      if (mode === "strength") {
        setSets([]);
        setReps(""); setWeight(""); setRir(""); setNotes("");
      } else {
        setCardio([]); setDuration("");
      }
      setSaved(true);
    } catch (error) {
      setError(failureMessage(error, t("Salvarea a eșuat. Antrenamentul a fost păstrat.", "Save failed. Your workout was kept.")));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <section className={`${panelClass} space-y-5`}>
    <div>
      <h2 className="flex items-center gap-2 text-xl font-bold"><Dumbbell className="size-5" aria-hidden="true" />{t("Antrenament nou", "New workout")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("1. Adaugă seturile sau activitățile în listă. 2. Salvează explicit antrenamentul complet. Lista nesalvată nu este păstrată dacă închizi pagina.", "1. Add sets or activities to the list. 2. Explicitly save the full workout. Unsaved lists are not kept if you close this page.")}</p>
    </div>
    <fieldset disabled={disabled || saving} className="min-w-0 space-y-5 disabled:opacity-60">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1 text-sm"><span>{t("Data antrenamentului", "Workout date")}</span><input type="date" required min="0001-01-01" max={localDate()} value={date} onChange={(event) => { setDate(event.target.value); setSaved(false); }} className={inputClass} /></label>
        <label className="block space-y-1 text-sm"><span>{t("Tip de antrenament", "Workout mode")}</span><select value={mode} onChange={(event) => { setMode(event.target.value as "strength" | "cardio"); setSaved(false); setError(null); }} className={inputClass}><option value="strength">{t("Forță", "Strength")}</option><option value="cardio">Cardio</option></select></label>
      </div>
      <form onSubmit={addEntry} className="space-y-4 rounded-xl border bg-secondary/10 p-3 sm:p-4">
        {mode === "strength" ? <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1 text-sm"><span>{t("Grupă / split pentru set", "Split for this set")}</span><select className={inputClass} value={split} onChange={(event) => setSplit(event.target.value)}>{SPLITS.map((item) => <option key={item} value={item}><WorkoutLabel value={item} /></option>)}</select></label>
            <label className="block space-y-1 text-sm"><span>{t("Tip de set", "Set type")}</span><select className={inputClass} value={setType} onChange={(event) => setSetType(event.target.value)}>{SET_TYPES.map((item) => <option key={item} value={item}><WorkoutLabel value={item} /></option>)}</select></label>
          </div>
          <label className="block space-y-1 text-sm"><span>{t("Exercițiu", "Exercise")}</span><select className={inputClass} value={exercise} onChange={(event) => setExercise(event.target.value)}>{EXERCISES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1 text-sm"><span>{t("Repetări", "Reps")}</span><input type="number" inputMode="numeric" required min="1" max="100000" step="1" value={reps} onChange={(event) => setReps(event.target.value)} className={inputClass} /></label>
            <label className="block space-y-1 text-sm"><span>{t("Greutate (kg)", "Weight (kg)")}</span><input type="number" inputMode="decimal" required min="0" max="99999" step="any" value={weight} onChange={(event) => setWeight(event.target.value)} className={inputClass} /></label>
            <label className="block space-y-1 text-sm"><span>RIR (0–10)</span><input type="number" inputMode="decimal" required min="0" max="10" step="any" value={rir} onChange={(event) => setRir(event.target.value)} className={inputClass} /></label>
          </div>
          <p className="text-xs text-muted-foreground">{t("RIR = repetări în rezervă. Pentru exerciții fără greutate suplimentară introdu 0 kg.", "RIR = reps in reserve. For exercises without added weight, enter 0 kg.")}</p>
          <label className="block space-y-1 text-sm"><span>{t("Notițe (opțional)", "Notes (optional)")}</span><textarea maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 w-full rounded-xl border bg-background p-3 text-sm" /></label>
        </> : <>
          <label className="block space-y-1 text-sm"><span>{t("Activitate", "Activity")}</span><select className={inputClass} value={activity} onChange={(event) => setActivity(event.target.value)}>{CARDIO_ACTIVITIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="block space-y-1 text-sm"><span>{t("Durată (minute)", "Duration (minutes)")}</span><input className={inputClass} type="number" inputMode="decimal" required min="0.01" max="1440" step="any" value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
        </>}
        <button type="submit" className="min-h-11 rounded-xl border bg-secondary px-4 text-sm font-semibold">{mode === "strength" ? t("Adaugă set în listă", "Add set to list") : t("Adaugă activitate în listă", "Add activity to list")}</button>
        <p className="text-xs text-muted-foreground">{t("Adăugarea în listă nu salvează încă pe dispozitiv. Numai lista tipului selectat va fi salvată.", "Adding to the list does not save to this device yet. Only the selected mode’s list will be saved.")}</p>
      </form>

      <div className="space-y-3">
        <h3 className="font-semibold">{t("Lista de salvat", "List to save")} ({mode === "strength" ? sets.length : cardio.length})</h3>
        {(mode === "strength" ? sets.length === 0 : cardio.length === 0) && <p className="text-sm text-muted-foreground">{t("Lista este goală. Adaugă prima înregistrare mai sus.", "The list is empty. Add your first entry above.")}</p>}
        {mode === "strength" ? sets.map((set, index) => <div key={set.uiId} className="flex items-start gap-3 rounded-xl border p-3">
          <div className="min-w-0 flex-1 space-y-1 text-sm">
            <p className="break-words font-semibold">{index + 1}. {set.exercise}</p>
            <p className="text-muted-foreground"><WorkoutLabel value={set.split} />{" · "}<WorkoutLabel value={set.setType} /></p>
            <p>{set.weight.toLocaleString(locale)} kg × {set.reps} {t("repetări", "reps")}{" · RIR "}{set.rir}</p>
            {set.notes && <p className="whitespace-pre-wrap break-words text-muted-foreground">{set.notes}</p>}
          </div>
          <button type="button" onClick={() => { setSets((current) => current.filter((entry) => entry.uiId !== set.uiId)); setSaved(false); }} aria-label={`${t("Elimină setul", "Remove set")} ${index + 1}`} className="flex size-11 shrink-0 items-center justify-center rounded-xl border text-red-700 dark:text-red-400"><Trash2 className="size-4" aria-hidden="true" /></button>
        </div>) : cardio.map((entry, index) => <div key={entry.uiId} className="flex items-start gap-3 rounded-xl border p-3">
          <Heart className="mt-1 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-sm"><p className="break-words font-semibold">{entry.activity}</p><p className="mt-1 text-muted-foreground">{entry.durationMin.toLocaleString(locale)} min</p></div>
          <button type="button" onClick={() => { setCardio((current) => current.filter((item) => item.uiId !== entry.uiId)); setSaved(false); }} aria-label={`${t("Elimină activitatea", "Remove activity")} ${index + 1}`} className="flex size-11 shrink-0 items-center justify-center rounded-xl border text-red-700 dark:text-red-400"><Trash2 className="size-4" aria-hidden="true" /></button>
        </div>)}
        {((mode === "strength" && cardio.length > 0) || (mode === "cardio" && sets.length > 0)) && <p className="text-xs text-muted-foreground">{t("Există și o listă nesalvată pentru celălalt tip. Schimbă tipul pentru a o vedea și salva separat.", "There is also an unsaved list for the other mode. Switch modes to view and save it separately.")}</p>}
      </div>
      <button type="button" onClick={() => void save()} disabled={mode === "strength" ? !sets.length : !cardio.length} className={`${buttonClass} w-full sm:w-auto`}>{saving ? t("Se salvează…", "Saving…") : t("Salvează antrenamentul complet", "Save full workout")}</button>
    </fieldset>
    {error && <p role="alert" className="break-words text-sm text-red-700 dark:text-red-400">{error}</p>}
    {saved && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{t("Antrenament salvat pe dispozitiv și pus în coada de sincronizare. Îl găsești în istoric, marcat nesincronizat până la confirmarea serverului.", "Workout saved on this device and queued for sync. Find it in history, marked pending until the server confirms it.")}</p>}
  </section>;
}
