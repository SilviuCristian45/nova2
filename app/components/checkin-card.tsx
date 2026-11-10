"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { getDailyCheckin, saveDailyCheckin } from "@/app/checkin/actions";
import { CHECKIN_NOTE_MAX, emptyCheckin, hasCheckinContent, parseCheckin, type CheckinValues } from "@/lib/checkin";
import { isMeasurementDate, localDate } from "@/lib/daily-metrics";
import { saveOfflineMutation, useOffline } from "@/lib/offline/client";
import { readOfflineDatabase } from "@/lib/offline/store";
import { useLanguage } from "./language-provider";
import { Card, TextLink, buttonClass, cx, inputClass } from "./ui";

const subscribeToDate = () => () => {};
const serverDate = () => "";

type Score = "energy" | "satiety" | "sleep";

// Ten tap targets, 1 to 10. Tapping the chosen one again clears the answer (every score is optional).
function ScorePicker({ label, low, high, value, disabled, onChange }: {
  label: string; low: string; high: string; value: number | null; disabled: boolean; onChange: (value: number | null) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="pl-0.5 text-[13px] font-medium text-muted">{label}</span>
        <span className="text-xs text-muted tabular-nums">{value === null ? "–" : `${value}/10`}</span>
      </div>
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, index) => index + 1).map((score) => {
          const active = score === value;
          return (
            <button key={score} type="button" role="radio" aria-checked={active} disabled={disabled}
              onClick={() => onChange(active ? null : score)}
              className={cx("min-h-10 rounded-sm text-sm font-semibold tabular-nums transition-colors disabled:opacity-50",
                active ? "bg-lime text-on-solid" : "bg-inner text-soft")}>
              {score}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between px-0.5 text-[11px] text-muted"><span>{low}</span><span>{high}</span></div>
    </div>
  );
}

// "How do you feel today": energy, satiety, sleep quality (1-10) and a short note, one entry per day.
// Online it goes through the server action; with an offline account it uses the local queue.
// Collapsed by default to a single summary line, so it does not push the workouts down the dashboard.
export default function CheckinCard({ chartLink = true }: { chartLink?: boolean }) {
  const { t } = useLanguage();
  const today = useSyncExternalStore(subscribeToDate, localDate, serverDate);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const date = selectedDate ?? today;
  const [open, setOpen] = useState(false);
  return (
    <Card aria-labelledby="checkin-title">
      {date && <CheckinBody key={date} date={date} today={today} onDateChange={setSelectedDate} open={open} setOpen={setOpen} chartLink={chartLink} />}
    </Card>
  );
}

function CheckinBody({ date, today, onDateChange, open, setOpen, chartLink }: {
  date: string; today: string; onDateChange: (date: string) => void; open: boolean; setOpen: (open: boolean) => void; chartLink: boolean;
}) {
  const { t } = useLanguage();
  const { ownerId } = useOffline();
  const [values, setValues] = useState<CheckinValues>(emptyCheckin);
  const [saved, setSaved] = useState<CheckinValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [retry, setRetry] = useState(0);
  const [pending, startTransition] = useTransition();

  function errorText(code: string) {
    switch (code) {
      case "unauthorized": return t("Sesiune expirată. Autentifică-te din nou.", "Session expired. Please sign in again.");
      case "invalid-date": return t("Alege o dată validă, cel târziu azi.", "Choose a valid date no later than today.");
      case "invalid-checkin": return t(`Alege cel puțin un scor de la 1 la 10 sau scrie o notiță (cel mult ${CHECKIN_NOTE_MAX} caractere).`, `Pick at least one score from 1 to 10 or write a note (up to ${CHECKIN_NOTE_MAX} characters).`);
      case "setup": return t("Check-in-ul necesită migrarea bazei de date. Consultă README.", "Check-ins require the database migration. See README.");
      default: return t("Nu am putut salva sau încărca check-in-ul. Reîncearcă.", "Unable to save or load your check-in. Please retry.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        let found: CheckinValues | null;
        if (ownerId) {
          const state = await readOfflineDatabase();
          if (state.activeOwner !== ownerId) throw new Error("Account changed.");
          const entry = state.accounts[ownerId]?.snapshot.checkins?.find((row) => row.date === date);
          found = entry ? { energy: entry.energy, satiety: entry.satiety, sleep: entry.sleep, note: entry.note } : null;
        } else {
          const result = await getDailyCheckin(date);
          if (!result.success) { if (!cancelled) { setError(result.error); setLoadFailed(true); } return; }
          found = result.checkin;
        }
        if (cancelled) return;
        setSaved(found);
        setValues(found ?? emptyCheckin());
      } catch {
        if (!cancelled) { setError("storage"); setLoadFailed(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [date, ownerId, retry]);

  const same = (a: CheckinValues | null, b: CheckinValues) =>
    a !== null && a.energy === b.energy && a.satiety === b.satiety && a.sleep === b.sleep && a.note === b.note.trim();
  const changed = hasCheckinContent(values) && !same(saved, values);
  const set = (field: Score, value: number | null) => { setValues((current) => ({ ...current, [field]: value })); setJustSaved(false); setError(null); };

  function submit() {
    setError(null);
    setJustSaved(false);
    const parsed = parseCheckin(values);
    if (!parsed) { setError("invalid-checkin"); return; }
    startTransition(async () => {
      try {
        if (ownerId) {
          await saveOfflineMutation({ kind: "checkin", date, ...parsed }, ownerId);
        } else {
          const formData = new FormData();
          formData.set("date", date);
          for (const field of ["energy", "satiety", "sleep"] as const) formData.set(field, parsed[field] === null ? "" : String(parsed[field]));
          formData.set("note", parsed.note);
          const result = await saveDailyCheckin(formData);
          if (!result.success) { setError(result.error); return; }
        }
        setSaved(parsed);
        setValues(parsed);
        setJustSaved(true);
        setOpen(false);
      } catch {
        setError("storage");
      }
    });
  }

  const disabled = pending || loading || loadFailed;
  const answers = saved ? [
    saved.energy !== null && `${t("Energie", "Energy")} ${saved.energy}`,
    saved.satiety !== null && `${t("Sațietate", "Satiety")} ${saved.satiety}`,
    saved.sleep !== null && `${t("Somn", "Sleep")} ${saved.sleep}`,
  ].filter(Boolean).join(" · ") || t("Doar o notiță", "Note only") : null;
  const summary = loadFailed ? t("Nu am putut încărca", "Could not load") : loading ? t("Se încarcă...", "Loading...")
    : answers ?? t("Atinge ca să completezi", "Tap to fill in");
  const isToday = date === today;
  return (
    <>
      <button type="button" aria-expanded={open} aria-controls="checkin-panel" onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 text-left">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span id="checkin-title" className="text-[13px] font-medium text-muted">
            {isToday ? t("Cum te simți azi?", "How do you feel today?") : t(`Check-in · ${date}`, `Check-in · ${date}`)}
          </span>
          <span className={cx("truncate text-[15px] font-semibold tabular-nums", saved ? "text-foreground" : "text-muted")}>{summary}</span>
        </span>
        <ChevronDown className={cx("size-5 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && <div id="checkin-panel" className="flex flex-col gap-3.5">
      <ScorePicker label={t("Energie", "Energy")} low={t("epuizat", "drained")} high={t("plin de energie", "full of energy")}
        value={values.energy} disabled={disabled} onChange={(value) => set("energy", value)} />
      <ScorePicker label={t("Sațietate", "Satiety")} low={t("flămând", "hungry")} high={t("sătul", "stuffed")}
        value={values.satiety} disabled={disabled} onChange={(value) => set("satiety", value)} />
      <ScorePicker label={t("Somn", "Sleep")} low={t("slab", "poor")} high={t("excelent", "great")}
        value={values.sleep} disabled={disabled} onChange={(value) => set("sleep", value)} />
      <input type="text" value={values.note} maxLength={CHECKIN_NOTE_MAX} disabled={disabled}
        aria-label={t("Notiță (opțional)", "Note (optional)")} placeholder={t("Notiță (opțional)", "Note (optional)")}
        onChange={(event) => { setValues((current) => ({ ...current, note: event.target.value })); setJustSaved(false); setError(null); }}
        className={inputClass()} />
      <div className="flex items-center gap-2.5">
        <input type="date" required value={date} min="0001-01-01" max={today || undefined} disabled={pending}
          aria-label={t("Data", "Date")}
          onChange={(event) => { if (isMeasurementDate(event.target.value)) onDateChange(event.target.value); }}
          className={inputClass({ className: "flex-1" })} />
        {changed && !loadFailed && (
          <button type="button" onClick={submit} disabled={disabled} className={buttonClass()}>
            {pending && <Loader2 className="size-[18px] animate-spin" />}
            {t("Salvează", "Save")}
          </button>
        )}
      </div>
      {loading && <p role="status" className="text-[13px] text-muted">{t("Se încarcă...", "Loading...")}</p>}
      {justSaved && <p role="status" className="text-[13px] font-semibold text-lime-text">{ownerId
        ? t("Salvat pe dispozitiv; verifică starea sincronizării.", "Saved to device; check sync status.")
        : t("Check-in salvat.", "Check-in saved.")}</p>}
      {error && <div role="alert" className="text-[13px] font-semibold text-red-text">
        <p>{errorText(error)}</p>
        {loadFailed && <button type="button" onClick={() => { setLoading(true); setLoadFailed(false); setError(null); setRetry((value) => value + 1); }} className="mt-2 font-bold underline">{t("Reîncearcă", "Retry")}</button>}
      </div>}
      {chartLink && <TextLink href="/stats?mode=checkin" className="self-start">{t("Vezi graficul", "View chart")}</TextLink>}
      </div>}
    </>
  );
}
