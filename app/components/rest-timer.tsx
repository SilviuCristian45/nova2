"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, Minus, Plus, SkipForward, Timer } from "lucide-react";
import { clampRest, DEFAULT_REST_SECONDS, formatClock, remainingSeconds, REST_PRESETS } from "@/lib/rest-timer";
import { useLanguage } from "./language-provider";

// Per-device preferences and the running timer, so a reload keeps counting.
const STORAGE_KEY = "replog-rest-timer";
type Stored = { duration: number; notify: boolean; endAt: number | null };

function readStored(): Stored {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return {
      duration: clampRest(Number(parsed.duration ?? DEFAULT_REST_SECONDS)),
      notify: parsed.notify === true,
      endAt: typeof parsed.endAt === "number" && parsed.endAt > Date.now() ? parsed.endAt : null,
    };
  } catch {
    return { duration: DEFAULT_REST_SECONDS, notify: false, endAt: null };
  }
}

function writeStored(value: Stored) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); }
  catch (error) { console.warn("Rest timer preferences could not be saved:", error); }
}

async function showNotification(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const options = { body, tag: "rest-timer", icon: "/icons/icon-192.png", vibrate: [200, 100, 200], renotify: true } as NotificationOptions;
  try {
    // Android only shows notifications through the service worker.
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) await registration.showNotification(title, options);
    else new Notification(title, options);
  } catch (error) {
    console.warn("Rest timer notification failed:", error);
  }
}

export type RestTimer = ReturnType<typeof useRestTimer>;

export function useRestTimer() {
  const { t } = useLanguage();
  const [duration, setDuration] = useState(DEFAULT_REST_SECONDS);
  const [notify, setNotify] = useState(false);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [finished, setFinished] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    async function restore() {
      const stored = readStored();
      setDuration(stored.duration);
      setNotify(stored.notify);
      setEndAt(stored.endAt);
      setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    }
    void restore();
  }, []);

  const persist = useCallback((next: Partial<Stored>) => {
    writeStored({ ...readStored(), ...next });
  }, []);

  const beep = useCallback(() => {
    const ctx = audio.current;
    if (!ctx) return;
    for (const offset of [0, 0.25, 0.5]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    }
  }, []);

  // One timeout for the end (accurate even in a background tab) plus a ticker for the display.
  useEffect(() => {
    if (endAt === null) return;
    const ticker = window.setInterval(() => setNow(Date.now()), 250);
    const done = window.setTimeout(() => {
      setEndAt(null);
      setFinished(true);
      persist({ endAt: null });
      beep();
      navigator.vibrate?.([200, 100, 200]);
      if (notify) void showNotification(t("Pauza s-a terminat", "Rest is over"), t("Timpul pentru următorul set!", "Time for your next set!"));
    }, Math.max(0, endAt - Date.now()));
    return () => { clearInterval(ticker); clearTimeout(done); };
  }, [endAt, notify, persist, beep, t]);

  useEffect(() => {
    if (!finished) return;
    const hide = window.setTimeout(() => setFinished(false), 6000);
    return () => clearTimeout(hide);
  }, [finished]);

  // Called from the "add set" click, so it also unlocks audio playback on mobile browsers.
  const start = useCallback(() => {
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    } catch { /* No audio; vibration and notification still work. */ }
    const next = Date.now() + duration * 1000;
    setNow(Date.now());
    setFinished(false);
    setEndAt(next);
    persist({ endAt: next });
  }, [duration, persist]);

  const adjust = useCallback((seconds: number) => {
    setEndAt((current) => {
      if (current === null) return current;
      const next = Math.max(Date.now() + 1000, current + seconds * 1000);
      persist({ endAt: next });
      return next;
    });
  }, [persist]);

  const skip = useCallback(() => {
    setEndAt(null);
    setFinished(false);
    persist({ endAt: null });
  }, [persist]);

  const chooseDuration = useCallback((seconds: number) => {
    const value = clampRest(seconds);
    setDuration(value);
    persist({ duration: value });
  }, [persist]);

  const toggleNotify = useCallback(async () => {
    if (notify) { setNotify(false); persist({ notify: false }); return; }
    if (typeof Notification === "undefined") { setPermission("unsupported"); return; }
    const result = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    setPermission(result);
    if (result === "granted") { setNotify(true); persist({ notify: true }); }
  }, [notify, persist]);

  return {
    duration, notify, permission, finished,
    running: endAt !== null,
    remaining: endAt === null ? 0 : remainingSeconds(endAt, now),
    start, adjust, skip, chooseDuration, toggleNotify,
  };
}

// Inline settings next to the set form: rest length and notifications.
export function RestTimerSettings({ timer }: { timer: RestTimer }) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-muted">
          <Timer className="size-3.5" />{t("Pauză între seturi", "Rest between sets")}
        </span>
        {REST_PRESETS.map((seconds) => (
          <button key={seconds} type="button" onClick={() => timer.chooseDuration(seconds)} aria-pressed={timer.duration === seconds}
            className={`h-9 rounded-full px-3 text-[13px] font-semibold tabular-nums transition-colors ${timer.duration === seconds
              ? "bg-lime text-on-solid"
              : "bg-inner text-muted"}`}>
            {formatClock(seconds)}
          </button>
        ))}
        <button type="button" onClick={() => void timer.toggleNotify()} aria-pressed={timer.notify}
          aria-label={timer.notify ? t("Oprește notificările", "Turn off notifications") : t("Pornește notificările", "Turn on notifications")}
          className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold ${timer.notify
            ? "bg-lime-soft text-lime-text" : "bg-inner text-muted"}`}>
          {timer.notify ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
          {t("Notificare", "Notify")}
        </button>
      </div>
      {timer.permission === "denied" && (
        <p className="text-xs font-semibold text-red-text">{t("Notificările sunt blocate din setările browserului.", "Notifications are blocked in your browser settings.")}</p>
      )}
      {timer.permission === "unsupported" && (
        <p className="text-xs text-muted">{t("Browserul nu suportă notificări. Pe iPhone, adaugă aplicația pe ecranul principal.", "This browser does not support notifications. On iPhone, add the app to your home screen.")}</p>
      )}
    </div>
  );
}

// Countdown pinned to the bottom of the screen while resting.
export function RestTimerBar({ timer }: { timer: RestTimer }) {
  const { t } = useLanguage();
  if (!timer.running && !timer.finished) return null;
  const progress = timer.running ? 1 - timer.remaining / Math.max(timer.duration, timer.remaining) : 1;
  return (
    <div role="timer" aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 bg-card/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="h-1.5 bg-inner"><div className="h-full rounded-r-full bg-lime transition-[width] duration-300" style={{ width: `${progress * 100}%` }} /></div>
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-5 py-3">
        {timer.running ? <>
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-muted">{t("Pauză", "Rest")}</span>
            <span className="text-[32px] font-bold leading-tight tracking-[-1px] tabular-nums">{formatClock(timer.remaining)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => timer.adjust(-15)} aria-label={t("Scade 15 secunde", "Subtract 15 seconds")}
              className="flex h-11 items-center gap-1 rounded-full bg-control px-3 text-sm font-semibold tabular-nums"><Minus className="size-4" />15</button>
            <button type="button" onClick={() => timer.adjust(15)} aria-label={t("Adaugă 15 secunde", "Add 15 seconds")}
              className="flex h-11 items-center gap-1 rounded-full bg-control px-3 text-sm font-semibold tabular-nums"><Plus className="size-4" />15</button>
            <button type="button" onClick={timer.skip} aria-label={t("Sari peste pauză", "Skip rest")}
              className="flex h-11 items-center gap-1.5 rounded-full bg-lime px-4 text-sm font-semibold text-on-solid"><SkipForward className="size-4" />{t("Gata", "Skip")}</button>
          </div>
        </> : <>
          <span className="text-[17px] font-bold text-lime-text">{t("Pauza s-a terminat. Următorul set!", "Rest is over. Next set!")}</span>
          <button type="button" onClick={timer.skip} className="h-11 rounded-full bg-control px-5 text-sm font-semibold">OK</button>
        </>}
      </div>
    </div>
  );
}
