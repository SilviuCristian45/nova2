"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Dumbbell, Heart, Plus, RefreshCw, Download, Trash2 } from "lucide-react";
import { useUnits } from "@/app/components/units-provider";
import { RestTimerBar, RestTimerSettings, useRestTimer } from "@/app/components/rest-timer";
import { useLanguage } from "@/app/components/language-provider";
import { cardioName, exerciseName } from "@/lib/exercise-catalog";
import { CardioName, ExerciseName } from "@/app/components/exercise-name";
import { CardioRows, SetRows, SetTypeBadge } from "@/app/components/workout-parts";
import { Badge, Message, Segmented, Select, buttonClass as buttonRecipe, inputClass as inputRecipe } from "@/app/components/ui";
import { WorkoutLabel, workoutLabelText } from "@/app/components/workout-label";
import { WorkoutSummaryDialog } from "@/app/components/workout-summary-dialog";
import type { SummaryInput } from "@/lib/workout-summary";
import { isMeasurementDate, localDate, parseBodyWeight } from "@/lib/daily-metrics";
import { randomId } from "@/lib/random-id";
import { localizeOfflineMessage } from "@/lib/offline/messages";
import { displayOrdinals } from "@/lib/set-numbering";
import { baselinesFromWorkouts, draftPersonalRecords } from "@/lib/personal-record";
import { rejectedEntryExport } from "@/lib/offline/rejected";
import { draftHasEntries } from "@/lib/workout-draft";
import { saveOfflineMutation, useOffline } from "@/lib/offline/client";
import type { OfflineCardio, OfflineMutation, OfflinePayload, OfflineSet, OfflineSnapshot } from "@/lib/offline/types";
import { CARDIO_ACTIVITIES, EXERCISES, SET_TYPES, SPLITS } from "@/lib/workout-data";

const inputClass = inputRecipe();
const buttonClass = buttonRecipe();
const panelClass = "flex min-w-0 flex-col gap-3.5 rounded-lg bg-card p-[18px]";
const labelClass = "flex flex-col gap-1.5 text-[13px] font-medium text-muted";
type LocalSet = OfflineSet & { uiId: string };
type LocalCardio = OfflineCardio & { uiId: string };

function failureMessage(error: unknown, fallback: string, t: (ro: string, en: string) => string) {
  return error instanceof Error ? localizeOfflineMessage(error.message, t) : fallback;
}

export default function OfflinePage() {
  const { t, locale } = useLanguage();
  const { ready, ownerId, online, syncing, pending, error, errorKind, rejected, otherPending, snapshot, sync, forget, retryRejected, discardRejected } = useOffline();
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
      setActionError(failureMessage(error, t("Sincronizarea a eșuat.", "Sync failed."), t));
    } finally {
      setRetrying(false);
    }
  }

  async function forgetData() {
    if (!window.confirm(t(
      rejected.length > 0
        ? "Ștergi datele offline de pe acest dispozitiv? Toate înregistrările nesincronizate vor fi pierdute, inclusiv cele respinse de server pe care nu le-ai exportat încă. Datele deja sincronizate rămân în cont."
        : "Ștergi datele offline de pe acest dispozitiv? Toate înregistrările nesincronizate vor fi pierdute. Datele deja sincronizate rămân în cont.",
      "Remove offline data from this device? All unsynced entries will be lost. Already synced data stays in your account.",
    ))) return;
    setActionError(null);
    setForgetting(true);
    try {
      await forget();
    } catch (error) {
      setActionError(failureMessage(error, t("Ștergerea locală a eșuat.", "Could not remove local data."), t));
    } finally {
      setForgetting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-5 pb-12 text-foreground">
      <header className="mb-2 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Link href="/" prefetch={false} className="-ml-2.5 flex size-11 shrink-0 items-center justify-center rounded-full text-soft active:opacity-60">
            <ArrowLeft className="size-5" aria-hidden="true" /><span className="sr-only">{t("Înapoi la panoul online", "Back to online dashboard")}</span>
          </Link>
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.8px]">{t("Spațiul de lucru offline", "Offline workspace")}</h1>
        </div>
        <div>
          <div>
            <p className="text-[13px] text-soft">{t(
              "Înregistrează antrenamente, pași și greutate pe acest dispozitiv. Modificările salvate se sincronizează când conexiunea revine. Nutriția necesită conexiune la internet.",
              "Log workouts, steps and weight on this device. Saved changes sync when your connection returns. Nutrition requires an internet connection.",
            )}</p>
          </div>
        </div>
      </header>

      <section aria-label={t("Starea sincronizării", "Sync status")} className={panelClass}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-2" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              <Badge tone={online ? "lime" : "gold"}>
                {!ready ? t("Se încarcă…", "Loading…") : online ? t("Conectat", "Online") : t("Fără conexiune", "Offline")}
              </Badge>
              {ready && <span className="tabular-nums">{pending.toLocaleString(locale)} {t("în așteptarea sincronizării", "queued for sync")}</span>}
            </div>
            {ready && <p className="text-[13px] text-muted">
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
        {(error || actionError) && <p role="alert" className="break-words rounded-md bg-red-soft p-3.5 text-sm font-semibold text-red-text">
          {t("Sincronizarea sau stocarea locală necesită atenție:", "Sync or local storage needs attention:")} {actionError || (error && localizeOfflineMessage(error, t))}
        </p>}
        {errorKind === "session" && <p role="status" className="rounded-md bg-gold-soft p-3.5 text-sm font-semibold text-gold-text">
          {t("Sesiunea a expirat sau nu mai este validă. Autentifică-te din nou: toate înregistrările offline sunt păstrate pe acest dispozitiv și se vor sincroniza după autentificare.", "Your session expired or is no longer valid. Sign in again: all offline entries are kept on this device and will sync after you sign in.")}
        </p>}
        {errorKind && errorKind !== "session" && errorKind !== "owner" && <p className="text-xs text-muted">
          {t("Nimic nu a fost șters. Sincronizarea se reia automat când conexiunea și serverul sunt disponibile.", "Nothing was deleted. Sync resumes automatically when the connection and the server are available.")}
        </p>}
        {otherPending > 0 && <p role="status" className="rounded-md bg-gold-soft p-3.5 text-sm font-semibold text-gold-text">
          {t(`${otherPending} înregistrări așteaptă sincronizarea pentru un alt cont de pe acest dispozitiv. Autentifică-te în acel cont ca să le sincronizezi; ele nu se pierd la schimbarea contului.`, `${otherPending} entries on this device are waiting to sync for another account. Sign in to that account to sync them; switching accounts does not lose them.`)}
        </p>}
        {activeSnapshot && <p className="text-xs text-muted">
          {t("Ultima descărcare:", "Last downloaded:")}{" "}
          <time dateTime={activeSnapshot.downloadedAt}>{new Date(activeSnapshot.downloadedAt).toLocaleString(locale)}</time>
          {" · "}{t("Datele sunt afișate numai pentru contul activ.", "Only the active account’s data is shown.")}
        </p>}
      </section>

      {!ready ? <p role="status" className="py-8 text-center text-muted">{t("Se deschide spațiul local…", "Opening local workspace…")}</p>
        : !ownerId ? <section className={panelClass}>
          <h2 className="text-[20px] font-semibold tracking-[-0.4px]">{t("Este necesară o primă conectare online", "An initial online sign-in is required")}</h2>
          <p className="text-[13px] text-soft">{t(
            "Nu există un cont activ pregătit pentru acces offline. Conectează-te online și descarcă datele pentru acest dispozitiv înainte de a înregistra offline. Dacă te-ai deconectat sau ai schimbat contul, revino online pentru verificare.",
            "No active account is prepared for offline access. Sign in online and download data for this device before logging offline. If you signed out or changed accounts, reconnect online to verify your account.",
          )}</p>
          <Link href="/login" prefetch={false} className={buttonClass}>{t("Conectare online", "Sign in online")}</Link>
        </section>
          : <>
            <OwnerWorkspace key={ownerId} snapshot={activeSnapshot} disabled={forgetting} />
            {rejected.length > 0 && <RejectedEntries entries={rejected} onRetry={retryRejected} onDiscard={discardRejected} />}
            <section className={panelClass}>
              <h2 className="text-[20px] font-semibold tracking-[-0.4px]">{t("Date pe acest dispozitiv", "Data on this device")}</h2>
              <p className="text-[13px] text-soft">{t(
                "Datele offline pot fi accesibile altor persoane care folosesc acest browser. Ștergerea lor elimină și înregistrările nesincronizate; nu șterge datele deja salvate online.",
                "Offline data may be accessible to others using this browser. Removing it also discards unsynced entries; it does not delete data already saved online.",
              )}</p>
              <button type="button" onClick={() => void forgetData()} disabled={forgetting || syncing || retrying} className={buttonRecipe({ variant: "soft", tone: "red" })}>
                <Trash2 className="size-4" aria-hidden="true" />{forgetting ? t("Se șterge…", "Removing…") : t("Șterge datele offline", "Remove offline data")}
              </button>
            </section>
          </>}
    </main>
  );
}

function RejectedEntries({ entries, onRetry, onDiscard }: { entries: OfflineMutation[]; onRetry: (id: string) => Promise<void>; onDiscard: (id: string) => Promise<void> }) {
  const { t, locale } = useLanguage();
  const [busy, setBusy] = useState<string | null>(null);

  function exportEntry(entry: OfflineMutation) {
    const { filename, json } = rejectedEntryExport(entry);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function run(id: string, action: () => Promise<void>) {
    setBusy(id);
    try { await action(); } finally { setBusy(null); }
  }

  return <section className={`${panelClass} border border-red-border`} aria-labelledby="rejected-title">
    <h2 id="rejected-title" className="text-[20px] font-semibold tracking-[-0.4px]">{t("Înregistrări respinse de server", "Entries rejected by the server")} ({entries.length})</h2>
    <p className="text-[13px] text-soft">{t(
      "Serverul a refuzat aceste înregistrări ca invalide. Rămân pe dispozitiv până decizi: exportă-le ca fișier, reîncearcă sau șterge-le. Restul înregistrărilor se sincronizează normal.",
      "The server refused these entries as invalid. They stay on this device until you decide: export them as a file, retry, or discard them. Other entries sync normally.",
    )}</p>
    <ul className="flex flex-col gap-2">
      {entries.map((entry) => <li key={entry.id} className="flex flex-col gap-2 rounded-md bg-inner p-3 text-sm">
        <p className="font-semibold">{entry.payload.kind === "workout" ? t("Antrenament", "Workout") : entry.payload.kind === "steps" ? t("Pași", "Steps") : t("Greutate corporală", "Body weight")}{" · "}{entry.payload.date}</p>
        <p className="break-words text-xs text-muted">{entry.rejected?.reason} {entry.rejected && <>({new Date(entry.rejected.at).toLocaleString(locale)})</>}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => exportEntry(entry)} className={buttonRecipe({ variant: "secondary", small: true })}><Download className="size-4" aria-hidden="true" />{t("Exportă", "Export")}</button>
          <button type="button" disabled={busy === entry.id} onClick={() => void run(entry.id, () => onRetry(entry.id))} className={buttonRecipe({ variant: "secondary", small: true })}>{t("Reîncearcă", "Retry")}</button>
          <button type="button" disabled={busy === entry.id} onClick={() => {
            if (window.confirm(t("Ștergi definitiv această înregistrare de pe dispozitiv? Dacă nu ai exportat-o, nu o mai poți recupera.", "Permanently delete this entry from the device? If you have not exported it, it cannot be recovered."))) void run(entry.id, () => onDiscard(entry.id));
          }} className={buttonRecipe({ variant: "soft", tone: "red", small: true })}><Trash2 className="size-4" aria-hidden="true" />{t("Șterge", "Discard")}</button>
        </div>
      </li>)}
    </ul>
  </section>;
}

function OwnerWorkspace({ snapshot, disabled }: { snapshot: OfflineSnapshot | null; disabled: boolean }) {
  const { t, locale } = useLanguage();
  const { format } = useUnits();
  return (
    <>
      <div className="flex flex-col gap-4">
        <MetricForm kind="steps" snapshot={snapshot} disabled={disabled} />
        <MetricForm kind="weight" snapshot={snapshot} disabled={disabled} />
      </div>
      <WorkoutForm disabled={disabled} />
      <section className={panelClass}>
        <div className="flex flex-col gap-1">
          <h2 className="text-[20px] font-semibold tracking-[-0.4px]">{t("Istoric descărcat · ultimele 90 de zile", "Downloaded history · last 90 days")}</h2>
          <p className="text-[13px] text-soft">{t(
            "Include antrenamentele salvate local în așteptarea sincronizării. Editarea și ștergerea antrenamentelor nu sunt disponibile offline; folosește istoricul online după sincronizare.",
            "Includes locally saved workouts awaiting sync. Editing and deleting workouts are not supported offline; use online history after syncing.",
          )}</p>
        </div>
        {!snapshot ? <p className="rounded-md bg-inner p-5 text-center text-sm font-medium text-muted">{t(
          "Istoricul nu a fost descărcat încă. Revino online și folosește Sincronizează / descarcă.",
          "History has not been downloaded yet. Reconnect and use Sync / download.",
        )}</p> : !snapshot.workouts.length ? <p className="rounded-md bg-inner p-5 text-center text-sm font-medium text-muted">{t(
          "Descărcarea este disponibilă, dar nu există antrenamente în această perioadă.",
          "Downloaded data is available, but there are no workouts in this period.",
        )}</p> : <div className="flex flex-col gap-2">
          {snapshot.workouts.map((workout) => (
            <details key={workout.id} className="min-w-0 overflow-hidden rounded-md bg-inner">
              <summary className="cursor-pointer p-3.5 marker:text-lime-text">
                <span className="ml-1 font-semibold">{new Date(`${workout.performed_on}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}{" · "}
                  {workout.workout_mode === "cardio" ? t("Cardio", "Cardio") : <WorkoutLabel value={workout.split} />}
                </span>
                {workout.pending && <Badge tone="gold" className="ml-2">{t("Nesincronizat", "Pending sync")}</Badge>}
                <span className="mt-1 block text-xs text-muted">{workout.workout_sets.length} {t("seturi", "sets")}{" · "}{workout.cardio_sessions.length} {t("activități cardio", "cardio entries")}{" · "}{t("Deschide detaliile", "Expand details")}</span>
              </summary>
              <div className="flex flex-col border-t border-line">
                {workout.workout_sets.map((set, setIndex) => <div key={set.id} className="flex flex-col gap-1 border-b border-line px-3.5 py-3 text-sm last:border-0">
                  <p className="break-words font-medium"><ExerciseName id={set.exercise} /></p>
                  <p className="flex flex-wrap items-center gap-2"><span className="text-muted tabular-nums">{t("Set", "Set")} {displayOrdinals(workout.workout_sets.map((x) => ({ exercise: x.exercise, order: x.set_number })))[setIndex]}</span><SetTypeBadge type={set.set_type} /></p>
                  <p className="font-semibold tabular-nums">{format(set.weight)} × {set.reps.toLocaleString(locale)} <span className="font-normal text-muted">{t("repetări", "reps")}{" · RIR "}{set.rir === null ? "–" : set.rir.toLocaleString(locale)}</span></p>
                  {set.notes && <p className="whitespace-pre-wrap break-words text-muted">{set.notes}</p>}
                </div>)}
                {workout.cardio_sessions.map((entry) => <div key={entry.id} className="border-b border-line px-3.5 py-3 text-sm last:border-0">
                  <p className="break-words font-medium"><CardioName id={entry.activity} /></p>
                  <p className="mt-1 font-semibold text-coral-text tabular-nums">{entry.duration_min.toLocaleString(locale)} min</p>
                </div>)}
                {!workout.workout_sets.length && !workout.cardio_sessions.length && <p className="p-3.5 text-sm text-muted">{t("Nu există detalii salvate pentru acest antrenament.", "No saved details for this workout.")}</p>}
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
  const { unit, toUnit, toKg, format } = useUnits();
  const { ownerId } = useOffline();
  const [date, setDate] = useState(localDate);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const existing = kind === "steps" ? snapshot?.steps.find((entry) => entry.date === date)?.steps : snapshot?.weights.find((entry) => entry.date === date)?.weight_kg;
  const value = draft[date] ?? (existing === undefined ? "" : String(kind === "weight" ? toUnit(existing) : existing));
  const title = kind === "steps" ? t("Pași", "Steps") : t("Greutate corporală", "Body weight");

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
      setError(kind === "steps" ? t("Introdu un număr întreg de pași, minimum 0.", "Enter a whole number of steps, at least 0.") : t(`Introdu o greutate pozitivă în ${unit}, cu maximum două zecimale.`, `Enter a positive weight in ${unit}, with at most two decimals.`));
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      if (!ownerId) throw new Error(t("Contul s-a schimbat.", "Account changed."));
      await saveOfflineMutation(kind === "steps" ? { kind, date, steps: number } : { kind, date, weightKg: toKg(number) }, ownerId);
      setSaved(true);
    } catch (error) {
      setError(failureMessage(error, t("Salvarea a eșuat. Datele au fost păstrate.", "Save failed. Your input was kept."), t));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <form onSubmit={submit} className={panelClass}>
    <h2 className="text-[20px] font-semibold tracking-[-0.4px]">{title}</h2>
    <fieldset disabled={disabled || saving} className="flex flex-col gap-3.5 disabled:opacity-60">
      <label className={labelClass}><span>{t("Data", "Date")}</span><input aria-label={`${title}: ${t("data", "date")}`} className={inputClass} type="date" required min="0001-01-01" max={localDate()} value={date} onChange={(event) => { setDate(event.target.value); setSaved(false); setError(null); }} /></label>
      <label className={labelClass}><span>{kind === "steps" ? t("Număr de pași", "Step count") : t(`Greutate (${unit})`, `Weight (${unit})`)}</span><input className={inputClass} type="number" inputMode={kind === "steps" ? "numeric" : "decimal"} required min={kind === "steps" ? 0 : 0.01} max={kind === "steps" ? 2147483647 : 9999.99} step={kind === "steps" ? 1 : 0.01} value={value} onChange={(event) => { setDraft((current) => ({ ...current, [date]: event.target.value })); setSaved(false); }} /></label>
      <p className="text-xs text-muted">{existing === undefined
        ? t("Nicio valoare locală pentru această dată; câmpul gol nu înseamnă zero.", "No local value for this date; a blank field does not mean zero.")
        : `${t("Valoare locală:", "Local value:")} ${kind === "weight" ? format(existing) : existing.toLocaleString(locale)}. ${t("Salvarea înlocuiește valoarea zilei.", "Saving replaces that day’s value.")}`}</p>
      <button className={buttonClass} type="submit">{saving ? t("Se salvează…", "Saving…") : t("Salvează pe dispozitiv", "Save on device")}</button>
    </fieldset>
    {error && <Message>{error}</Message>}
    {saved && <p role="status" className="text-[13px] font-semibold text-lime-text">{t("Salvat pe dispozitiv și adăugat în coada de sincronizare. Starea de sus confirmă când coada este golită.", "Saved on this device and queued for sync. The status above confirms when the queue is empty.")}</p>}
  </form>;
}

function WorkoutForm({ disabled }: { disabled: boolean }) {
  const { ownerId, snapshot } = useOffline();
  const { t, language } = useLanguage();
  const { unit, toUnit, toKg } = useUnits();
  const restTimer = useRestTimer();
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
  const [finished, setFinished] = useState<SummaryInput | null>(null);
  // Same PR rule as /insert, against the best sets in the history downloaded to this device (plus unsynced workouts).
  const records = useMemo(() => {
    const draft = sets.map((set) => ({ id: set.uiId, exercise: set.exercise, weight: set.weight, reps: set.reps, setType: set.setType }));
    const baselines = baselinesFromWorkouts(snapshot?.workouts ?? [], [...new Set(draft.map((set) => set.exercise))]);
    return draftPersonalRecords(draft, baselines);
  }, [sets, snapshot]);
  const ordinals = displayOrdinals(sets.map((set, index) => ({ exercise: set.exercise, order: index })));
  // ownerId is only known after mount, so localStorage is never read during server rendering.
  const hasDraft = useMemo(() => {
    try {
      return ownerId ? draftHasEntries(localStorage.getItem(`workout_draft_v1_${ownerId}`)) : false;
    } catch (error) {
      console.warn("Workout draft could not be checked:", error);
      return false;
    }
  }, [ownerId]);

  function addEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (mode === "strength") {
      const r = Number(reps), w = Number(weight), reserve = rir.trim() === "" ? null : Number(rir); // RIR is optional
      if (!reps.trim() || !weight.trim() || !Number.isSafeInteger(r) || r < 1 || r > 100000 || !Number.isFinite(w) || w < 0 || toKg(w) > 10000 || (reserve !== null && (!Number.isSafeInteger(reserve) || reserve < 0 || reserve > 5))) {
        setError(t("Repetările trebuie să fie întregi și pozitive, greutatea între 0 și 10000, iar RIR (opțional) un număr întreg între 0 și 5.", "Reps must be positive whole numbers, weight between 0 and 10000, and RIR (optional) a whole number between 0 and 5."));
        return;
      }
      setSets((current) => [...current, { uiId: randomId(), split, exercise, setNumber: current.length + 1, reps: r, weight: toKg(w), rir: reserve, setType, notes }]);
      restTimer.start();
    } else {
      const minutes = Number(duration);
      if (!duration.trim() || !Number.isSafeInteger(minutes) || minutes < 1 || minutes > 1440) {
        setError(t("Durata trebuie să fie un număr întreg de minute, între 1 și 1440.", "Duration must be a whole number of minutes between 1 and 1440."));
        return;
      }
      setCardio((current) => [...current, { uiId: randomId(), activity, durationMin: minutes }]);
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
      sets: mode === "strength" ? sets.map((set, index) => ({
        split: set.split, exercise: set.exercise, reps: set.reps, weight: set.weight,
        rir: set.rir, setType: set.setType, notes: set.notes,
        setNumber: index + 1, // position in the workout; shown per exercise
      })) : [],
      cardio: mode === "cardio" ? cardio.map(({ activity, durationMin }) => ({ activity, durationMin })) : [],
    };
    savingRef.current = true;
    setSaving(true);
    try {
      if (!ownerId) throw new Error(t("Contul s-a schimbat.", "Account changed."));
      await saveOfflineMutation(payload, ownerId);
      // Same card as /insert, built before the lists are cleared. There is no timer here.
      const summary: SummaryInput = {
        date,
        mode,
        title: mode === "strength" ? workoutLabelText(sets[0].split, t) : "Cardio",
        durationSec: null,
        sets: mode === "strength" ? sets.map((set) => ({ id: set.uiId, exercise: set.exercise, weight: set.weight, reps: set.reps, setType: set.setType })) : [],
        cardio: mode === "cardio" ? cardio.map(({ activity, durationMin }) => ({ activity, durationMin })) : [],
        recordIds: records,
      };
      if (mode === "strength") {
        setSets([]);
        setReps(""); setWeight(""); setRir(""); setNotes("");
      } else {
        setCardio([]); setDuration("");
      }
      setSaved(true);
      setFinished(summary);
    } catch (error) {
      setError(failureMessage(error, t("Salvarea a eșuat. Antrenamentul a fost păstrat.", "Save failed. Your workout was kept."), t));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <section className="flex flex-col gap-4">
    <div className={panelClass}>
      <div className="flex flex-col gap-1">
        <h2 className="text-[20px] font-semibold tracking-[-0.4px]">{t("Antrenament nou", "New workout")}</h2>
        <p className="text-[13px] text-soft">{t("1. Adaugă seturile sau activitățile în listă. 2. Salvează explicit antrenamentul complet. Lista nesalvată nu este păstrată dacă închizi pagina.", "1. Add sets or activities to the list. 2. Explicitly save the full workout. Unsaved lists are not kept if you close this page.")}</p>
      </div>
      <p className="rounded-md bg-inner p-3 text-xs text-muted">
        {t("Recordurile personale se compară cu cele mai bune seturi din istoricul descărcat pe acest dispozitiv (ultimele 90 de zile, plus antrenamentele nesincronizate); un exercițiu fără istoric aici nu primește insignă de record. Nu există cronometru de antrenament.", "Personal records are compared with your best sets in the history downloaded to this device (last 90 days, plus unsynced workouts); an exercise with no history here gets no record badge. There is no workout timer.")}
      </p>
      {hasDraft && <p role="status" className="rounded-md bg-gold-soft p-3.5 text-sm font-semibold text-gold-text">
        {t("Ai o ciornă nesalvată în pagina principală de înregistrare. Nu poate fi continuată aici și nu este inclusă în acest antrenament; o regăsești acolo când revii online.", "You have an unsaved draft on the main log page. It cannot be continued here and is not part of this workout; you will find it there when you are back online.")}
      </p>}
    </div>
    <fieldset disabled={disabled || saving} className="flex min-w-0 flex-col gap-4 disabled:opacity-60">
      <Segmented
        label={t("Tip de antrenament", "Workout mode")}
        value={mode}
        onChange={(next) => { setMode(next); setSaved(false); setError(null); }}
        options={[
          { value: "strength", label: t("Forță", "Strength"), icon: Dumbbell },
          { value: "cardio", label: "Cardio", icon: Heart },
        ]}
      />
      <div className={panelClass}>
        <label className={labelClass}><span>{t("Data antrenamentului", "Workout date")}</span><input type="date" required min="0001-01-01" max={localDate()} value={date} onChange={(event) => { setDate(event.target.value); setSaved(false); }} className={inputClass} /></label>
      </div>
      <form onSubmit={addEntry} className={panelClass}>
        {mode === "strength" ? <>
          <div className={labelClass}><span>{t("Grupă / split pentru set", "Split for this set")}</span>
            <Select title={t("Grupă / split pentru set", "Split for this set")} value={split} onChange={setSplit}
              options={SPLITS.map((item) => ({ value: item, label: workoutLabelText(item, t) }))} /></div>
          <div className={labelClass}><span>{t("Exercițiu", "Exercise")}</span>
            <Select searchable title={t("Exercițiu", "Exercise")} value={exercise} onChange={setExercise}
              options={EXERCISES.map((item) => ({ value: item, label: exerciseName(item, language) }))} /></div>
          <div className="grid grid-cols-4 gap-2">
            <label className={labelClass}><span>{t("Set", "Set")}</span><input type="number" readOnly aria-readonly="true" value={sets.filter((set) => set.exercise === exercise).length + 1} className={inputRecipe({ center: true, compact: true })} /></label>
            <label className={labelClass}><span>{unit}</span><input type="number" inputMode="decimal" required min="0" max={Math.floor(toUnit(10000))} step="any" placeholder="0" value={weight} onChange={(event) => setWeight(event.target.value)} className={inputRecipe({ big: true, compact: true })} /></label>
            <label className={labelClass}><span>{t("Repetări", "Reps")}</span><input type="number" inputMode="numeric" required min="1" max="100000" step="1" placeholder="0" value={reps} onChange={(event) => setReps(event.target.value)} className={inputRecipe({ big: true, compact: true })} /></label>
            <label className={labelClass}><span>RIR</span><input type="number" inputMode="numeric" min="0" max="5" step="1" placeholder="–" value={rir} onChange={(event) => setRir(event.target.value)} className={inputRecipe({ big: true, compact: true })} /></label>
          </div>
          <p className="text-xs text-muted">{t(`RIR = repetări în rezervă. Pentru exerciții fără greutate suplimentară introdu 0 ${unit}.`, `RIR = reps in reserve. For exercises without added weight, enter 0 ${unit}.`)}</p>
          <div className={labelClass}><span>{t("Tip set", "Set type")}</span>
            <Select title={t("Tip set", "Set type")} value={setType} onChange={setSetType}
              options={SET_TYPES.map((item) => ({ value: item, label: workoutLabelText(item, t) }))} /></div>
          <label className={labelClass}><span>{t("Notițe (opțional)", "Notes (optional)")}</span><input type="text" maxLength={99} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t("Ex: Scaunul la 3...", "E.g. Seat at 3...")} className={inputClass} /></label>
        </> : <>
          <div className={labelClass}><span>{t("Activitate", "Activity")}</span>
            <Select title={t("Activitate", "Activity")} value={activity} onChange={setActivity}
              options={CARDIO_ACTIVITIES.map((item) => ({ value: item, label: cardioName(item, language) }))} /></div>
          <label className={labelClass}><span>{t("Durată (minute)", "Duration (minutes)")}</span><input className={inputRecipe({ big: true })} type="number" inputMode="numeric" required min="1" max="1440" step="1" value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
        </>}
        <button type="submit" className={buttonRecipe({ variant: "secondary" })}><Plus className="size-[18px]" aria-hidden="true" />{mode === "strength" ? t("Adaugă set în listă", "Add set to list") : t("Adaugă activitate în listă", "Add activity to list")}</button>
        <p className="text-xs text-muted">{t("Adăugarea în listă nu salvează încă pe dispozitiv. Numai lista tipului selectat va fi salvată.", "Adding to the list does not save to this device yet. Only the selected mode’s list will be saved.")}</p>
        {mode === "strength" && <RestTimerSettings timer={restTimer} />}
      </form>

      <h3 className="mt-2 pl-0.5 text-[13px] font-medium text-muted">{t("Lista de salvat", "List to save")} ({mode === "strength" ? sets.length : cardio.length})</h3>
      {mode === "strength" ? (
        <SetRows
          rows={sets.map((set, index) => ({
            key: set.uiId, ordinal: ordinals[index], exercise: set.exercise, weightKg: set.weight, reps: set.reps,
            rir: set.rir, setType: set.setType, notes: set.notes, record: records.has(set.uiId),
            extra: <Badge><WorkoutLabel value={set.split} /></Badge>,
          }))}
          onRemove={(key) => { setSets((current) => current.filter((entry) => entry.uiId !== key)); setSaved(false); }}
          empty={t("Lista este goală. Adaugă prima înregistrare mai sus.", "The list is empty. Add your first entry above.")}
        />
      ) : (
        <CardioRows
          rows={cardio.map((entry) => ({ key: entry.uiId, activity: entry.activity, durationMin: entry.durationMin }))}
          onRemove={(key) => { setCardio((current) => current.filter((item) => item.uiId !== key)); setSaved(false); }}
          empty={t("Lista este goală. Adaugă prima înregistrare mai sus.", "The list is empty. Add your first entry above.")}
        />
      )}
      {((mode === "strength" && cardio.length > 0) || (mode === "cardio" && sets.length > 0)) && <p className="text-xs text-muted">{t("Există și o listă nesalvată pentru celălalt tip. Schimbă tipul pentru a o vedea și salva separat.", "There is also an unsaved list for the other mode. Switch modes to view and save it separately.")}</p>}
      <button type="button" onClick={() => void save()} disabled={mode === "strength" ? !sets.length : !cardio.length} className={buttonRecipe({ large: true, className: "mt-4" })}>{saving ? t("Se salvează…", "Saving…") : t("Salvează antrenamentul complet", "Save full workout")}</button>
    </fieldset>
    {error && <Message>{error}</Message>}
    {saved && <p role="status" className="text-[13px] font-semibold text-lime-text">{t("Antrenament salvat pe dispozitiv și pus în coada de sincronizare. Îl găsești în istoric, marcat nesincronizat până la confirmarea serverului.", "Workout saved on this device and queued for sync. Find it in history, marked pending until the server confirms it.")}</p>}
    <RestTimerBar timer={restTimer} />
    {finished && <WorkoutSummaryDialog input={finished} onClose={() => setFinished(null)} />}
  </section>;
}
