"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Share2, X } from "lucide-react";
import { useLanguage } from "@/app/components/language-provider";
import { buildWorkoutSummary, type SummaryInput } from "@/lib/workout-summary";
import { renderWorkoutSummary } from "@/lib/workout-summary-canvas";
import { useUnits } from "@/app/components/units-provider";
import { canShareFile, isIOSLike, shareImageFile } from "@/lib/share-image";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Shown after the workout is already saved: nothing here can affect the saved data.
export function WorkoutSummaryDialog({ input, onClose }: { input: SummaryInput; onClose: () => void }) {
  const { t, language, locale } = useLanguage();
  const { format, toUnit, unit } = useUnits();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Fixed at mount: the card is a snapshot of the finished workout.
  const [snapshot] = useState(input);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    async function generate() {
      try {
        const summary = buildWorkoutSummary(snapshot, {
          language,
          locale,
          formatWeight: format,
          formatVolume: (kg) => `${Math.round(toUnit(kg)).toLocaleString(locale)} ${unit}`,
        });
        const image = await renderWorkoutSummary(summary, {
          recordsTitle: t("Recorduri personale", "Personal records"),
          recordBadge: t("Record", "PR"),
          moreExercises: (count) => t(`+ încă ${count} exerciții`, `+ ${count} more exercises`),
          moreSets: (count) => t(`+${count} seturi`, `+${count} sets`),
          moreRecords: (count) => t(`+${count} recorduri`, `+${count} records`),
          setsSummary: (total, top) => `${total} ${t("seturi", "sets")} · ${top}`,
        });
        if (cancelled) return;
        setBlob(image);
        setAlt(
          `${t("Rezumatul antrenamentului", "Workout summary")}: ${summary.title}, ${summary.dateLabel}. ` +
            summary.stats.map((stat) => `${stat.label} ${stat.value}`).join(", ") +
            (summary.records.length ? `. ${t("Recorduri personale", "Personal records")}: ${summary.records.length}` : ""),
        );
        setUrl(URL.createObjectURL(image));
      } catch (error) {
        console.error("Workout summary image could not be created:", error);
        if (!cancelled) setFailed(true);
      }
    }
    void generate();
    return () => {
      cancelled = true;
    };
  }, [snapshot, language, locale, format, toUnit, unit, t]);

  // The previous image URL is revoked only after the new one is rendered (and on unmount), so the
  // download link never points at a revoked URL while a new card is being generated.
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  // Escape closes; Tab stays inside the dialog; focus goes back to where it was.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    // The page behind must not be reachable (Tab, screen readers) or scroll while the dialog is open.
    const inerted: HTMLElement[] = [];
    for (let node: HTMLElement | null = dialog; node && node !== document.body; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement?.children ?? [])) {
        if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert) {
          sibling.inert = true;
          inerted.push(sibling);
        }
      }
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      inerted.forEach((element) => { element.inert = false; });
      document.body.style.overflow = previousOverflow;
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  const fileName = `replog-${snapshot.date}.png`;
  // Built once per generated image, not on every render.
  const file = useMemo(() => (blob ? new File([blob], fileName, { type: "image/png" }) : null), [blob, fileName]);
  const canShare = canShareFile(typeof navigator === "undefined" ? undefined : navigator, file);
  const ios = typeof navigator !== "undefined" && isIOSLike(navigator.userAgent, navigator.maxTouchPoints);

  async function share() {
    if (!file) return;
    setNotice(null);
    const result = await shareImageFile(navigator, file, "RepLog");
    if (result === "failed" || result === "unsupported")
      setNotice(t("Distribuirea nu a reușit. Salvează imaginea și trimite-o manual.", "Sharing failed. Save the image and send it manually."));
  }

  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t("Rezumatul antrenamentului", "Workout summary")}
      className="fixed inset-0 z-[1000] flex flex-col items-center gap-4 overflow-y-auto bg-black/85 p-5 outline-none backdrop-blur-sm">
      <div className="flex w-full max-w-sm items-center justify-between pt-2 text-zinc-100">
        <h2 className="text-lg font-extrabold"><span aria-hidden="true">🏆 </span>{t("Antrenament salvat", "Workout saved")}</h2>
        <button type="button" onClick={onClose} className="flex size-11 items-center justify-center rounded-xl border border-zinc-700 hover:bg-zinc-800">
          <X className="size-5" aria-hidden="true" /><span className="sr-only">{t("Închide", "Close")}</span>
        </button>
      </div>

      <div className="flex w-full max-w-sm flex-1 items-center justify-center">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={alt || t("Previzualizare imagine antrenament", "Workout image preview")} className="max-h-[62dvh] w-auto rounded-2xl border border-zinc-800 shadow-2xl" />
        ) : failed ? (
          <p role="alert" className="rounded-xl border border-zinc-700 p-4 text-center text-sm text-zinc-300">
            {t("Imaginea nu a putut fi generată, dar antrenamentul este salvat.", "The image could not be created, but your workout is saved.")}
          </p>
        ) : (
          <p role="status" className="flex items-center gap-2 text-sm text-zinc-300"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{t("Se generează imaginea...", "Creating image...")}</p>
        )}
      </div>

      {notice && <p role="status" className="max-w-sm text-center text-sm text-amber-400">{notice}</p>}
      {url && ios && (
        <p className="max-w-sm text-center text-xs text-zinc-400">
          {t("Pe iPhone, dacă imaginea se deschide într-o filă, ține apăsat pe ea și alege „Adaugă în Poze”.", "On iPhone, if the image opens in a tab, press and hold it and choose “Add to Photos”.")}
        </p>
      )}

      <div className="grid w-full max-w-sm gap-3 pb-2">
        {url && (
          <div className="grid grid-cols-2 gap-3">
            {canShare ? (
              <button type="button" onClick={share} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 font-bold text-zinc-950 hover:bg-emerald-400">
                <Share2 className="size-4" aria-hidden="true" />{t("Distribuie", "Share")}
              </button>
            ) : null}
            <a href={url} download={fileName} className={`flex h-12 items-center justify-center gap-2 rounded-xl border border-zinc-600 font-bold text-zinc-100 hover:bg-zinc-800 ${canShare ? "" : "col-span-2"}`}>
              <Download className="size-4" aria-hidden="true" />{t("Salvează imaginea", "Save image")}
            </a>
          </div>
        )}
        <button type="button" onClick={onClose} className="h-12 rounded-xl border border-zinc-700 font-bold text-zinc-200 hover:bg-zinc-800">
          {t("Continuă", "Continue")}
        </button>
      </div>
    </div>
  );
}
