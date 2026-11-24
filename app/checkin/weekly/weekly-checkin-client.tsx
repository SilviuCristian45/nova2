"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, Clock, Send, X } from "lucide-react";
import { Text, useLanguage } from "@/app/components/language-provider";
import { useUnits } from "@/app/components/units-provider";
import {
  CheckinPhotoLightbox,
  CheckinPhotoStrip,
  checkinSlotLabel,
  resizeCheckinPhotoToJpeg,
  type PhotoPreviewItem,
} from "@/app/components/checkin-photos";
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
import { CHECKIN_PHOTO_BUCKET, checkinPhotoPath, hasAnyCheckinPhoto } from "@/lib/checkin-photos";
import {
  CHECKIN_PHOTO_SLOTS,
  type CheckinPhotoSlot,
  type WeeklyCheckinWithPhotos,
} from "@/lib/coach/types";
import { createClient } from "@/utils/supabase/client";
import { submitWeeklyCheckinAction } from "./actions";

export type ActiveCoachOption = {
  coachId: string;
  coachName: string;
  enrollmentId: string;
  programTitle: string | null;
};

type SlotDraft = {
  path: string | null;
  file: File | null;
  previewUrl: string | null;
};

type SlotDraftMap = Record<CheckinPhotoSlot, SlotDraft>;

function entryPathForSlot(entry: WeeklyCheckinWithPhotos | null, slot: CheckinPhotoSlot): string | null {
  if (!entry) return null;
  if (slot === "front") return entry.photo_front_path ?? null;
  if (slot === "back") return entry.photo_back_path ?? null;
  return entry.photo_side_path ?? null;
}

function initialPhotoDrafts(entry: WeeklyCheckinWithPhotos | null): SlotDraftMap {
  return {
    front: { path: entry?.photo_front_path ?? null, file: null, previewUrl: null },
    back: { path: entry?.photo_back_path ?? null, file: null, previewUrl: null },
    side: { path: entry?.photo_side_path ?? null, file: null, previewUrl: null },
  };
}

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
  userId,
  weekStart,
  coaches,
  latestWeightKg,
  history,
}: {
  userId: string;
  weekStart: string;
  coaches: ActiveCoachOption[];
  latestWeightKg: number | null;
  history: WeeklyCheckinWithPhotos[];
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
  const [photoDrafts, setPhotoDrafts] = useState<SlotDraftMap>(() => initialPhotoDrafts(currentWeekEntry));
  const [previewSlot, setPreviewSlot] = useState<CheckinPhotoSlot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fileInputs = useRef<Partial<Record<CheckinPhotoSlot, HTMLInputElement | null>>>({});
  const objectUrlsRef = useRef<Set<string>>(new Set());

  function revokePreviewUrl(url: string | null) {
    if (!url) return;
    URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(url);
  }

  function revokeAllPreviewUrls() {
    for (const url of objectUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    objectUrlsRef.current.clear();
  }

  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  function displayUrlForSlot(slot: CheckinPhotoSlot): string | null {
    const draft = photoDrafts[slot];
    if (draft.previewUrl) return draft.previewUrl;
    if (draft.path && draft.path === entryPathForSlot(currentWeekEntry, slot)) {
      return currentWeekEntry?.photoUrls?.[slot] ?? null;
    }
    return null;
  }

  function handlePickPhoto(slot: CheckinPhotoSlot, file: File | null) {
    if (!file) return;
    const nextUrl = URL.createObjectURL(file);
    objectUrlsRef.current.add(nextUrl);
    setPhotoDrafts((prev) => {
      revokePreviewUrl(prev[slot].previewUrl);
      return {
        ...prev,
        [slot]: { path: null, file, previewUrl: nextUrl },
      };
    });
    setError(null);
  }

  function handleClearPhoto(slot: CheckinPhotoSlot) {
    setPhotoDrafts((prev) => {
      revokePreviewUrl(prev[slot].previewUrl);
      return {
        ...prev,
        [slot]: { path: null, file: null, previewUrl: null },
      };
    });
    const input = fileInputs.current[slot];
    if (input) input.value = "";
  }

  function switchCoach(nextCoachId: string) {
    setSelectedCoachId(nextCoachId);
    const entry = history.find((item) => item.coach_id === nextCoachId && item.week_start === weekStart) ?? null;
    const w = entry?.weight_kg ?? latestWeightKg;
    setWeightInput(w !== null ? String(Number(toUnit(Number(w)).toFixed(2))) : "");
    setEnergy(entry?.energy ?? 4);
    setSleep(entry?.sleep ?? 4);
    setStress(entry?.stress ?? 2);
    setNotes(entry?.client_notes ?? "");
    revokeAllPreviewUrls();
    setPhotoDrafts(initialPhotoDrafts(entry));
    setPreviewSlot(null);
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

    const supabase = createClient();
    const newlyUploadedPaths: string[] = [];
    const nextPaths: Record<CheckinPhotoSlot, string | null> = {
      front: photoDrafts.front.path,
      back: photoDrafts.back.path,
      side: photoDrafts.side.path,
    };

    try {
      for (const slot of CHECKIN_PHOTO_SLOTS) {
        const picked = photoDrafts[slot].file;
        if (!picked) continue;
        const blob = await resizeCheckinPhotoToJpeg(picked);
        const path = checkinPhotoPath(userId, crypto.randomUUID());
        const upload = await supabase.storage
          .from(CHECKIN_PHOTO_BUCKET)
          .upload(path, blob, { contentType: "image/jpeg" });
        if (upload.error) throw new Error(upload.error.message);
        newlyUploadedPaths.push(path);
        nextPaths[slot] = path;
      }

      const res = await submitWeeklyCheckinAction({
        coachId: activeCoach.coachId,
        enrollmentId: activeCoach.enrollmentId,
        weekStart,
        weightKg: parsedWeight === null ? null : toKg(parsedWeight),
        energy,
        sleep,
        stress,
        clientNotes: notes,
        photoFrontPath: nextPaths.front,
        photoBackPath: nextPaths.back,
        photoSidePath: nextPaths.side,
      });

      if (res.error) {
        if (newlyUploadedPaths.length > 0) {
          await supabase.storage.from(CHECKIN_PHOTO_BUCKET).remove(newlyUploadedPaths);
        }
        setError(res.error);
        return;
      }

      // Keep local previewUrl until the next coach switch/navigation so there is no flicker while router.refresh() fetches new signed URLs.
      setPhotoDrafts((prev) => ({
        front: { path: nextPaths.front, file: null, previewUrl: prev.front.previewUrl },
        back: { path: nextPaths.back, file: null, previewUrl: prev.back.previewUrl },
        side: { path: nextPaths.side, file: null, previewUrl: prev.side.previewUrl },
      }));
      setSuccess(res.message ?? t("Salvat.", "Saved."));
      router.refresh();
    } catch (caught) {
      if (newlyUploadedPaths.length > 0) {
        await supabase.storage.from(CHECKIN_PHOTO_BUCKET).remove(newlyUploadedPaths);
      }
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(
        message === "too-large"
          ? t("Una dintre poze este prea mare (maxim 5 MB).", "One of the photos is too large (max 5 MB).")
          : message === "invalid-image"
            ? t("Imagine invalidă sau format nesuportat.", "Invalid image or unsupported format.")
            : /bucket not found|schema cache|does not exist/i.test(message)
              ? t(
                  "Rulează migrația 202611240003_weekly_checkin_photos.sql în Supabase.",
                  "Run the 202611240003_weekly_checkin_photos.sql migration in Supabase.",
                )
              : message,
      );
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

  const lightboxItems: PhotoPreviewItem[] = CHECKIN_PHOTO_SLOTS
    .map((slot) => {
      const url = displayUrlForSlot(slot);
      return url ? { slot, url } : null;
    })
    .filter((item): item is PhotoPreviewItem => item !== null);
  const lightboxInitialIndex = previewSlot
    ? lightboxItems.findIndex((item) => item.slot === previewSlot)
    : -1;

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

          {/* Optional 3 progress photos (front, back, side) */}
          {isReviewed ? (
            hasAnyCheckinPhoto(currentWeekEntry?.photoUrls) && (
              <div className="flex flex-col gap-1.5">
                <span className="pl-0.5 text-[13px] font-medium text-muted">
                  <Text ro="Poze atașate" en="Attached photos" />
                </span>
                <CheckinPhotoStrip photoUrls={currentWeekEntry?.photoUrls} />
              </div>
            )
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-0.5 pl-0.5">
                <span className="text-[13px] font-medium text-muted">
                  <Text ro="Poze de progres (opțional)" en="Progress photos (optional)" />
                </span>
                <span className="text-xs text-muted">
                  <Text
                    ro="Poți încărca până la 3 poze (față, spate, profil). Sunt vizibile doar pentru acest antrenor."
                    en="Upload up to 3 photos (front, back, side). Visible only to this coach."
                  />
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {CHECKIN_PHOTO_SLOTS.map((slot) => {
                  const label = checkinSlotLabel(slot, t);
                  const url = displayUrlForSlot(slot);

                  return (
                    <div key={slot} className="relative aspect-[3/4]">
                      <input
                        ref={(el) => {
                          fileInputs.current[slot] = el;
                        }}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          handlePickPhoto(slot, e.target.files?.[0] ?? null);
                          e.target.value = "";
                        }}
                      />
                      {url ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setPreviewSlot(slot)}
                            className="relative size-full overflow-hidden rounded-md bg-inner transition-opacity active:opacity-80"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- local preview or signed Storage URL */}
                            <img src={url} alt={label} className="size-full object-cover" />
                            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white">
                              {label}
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={submitting}
                            aria-label={`${t("Elimină poza", "Remove photo")} (${label})`}
                            onClick={() => handleClearPhoto(slot)}
                            className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/70 text-white transition-colors active:bg-black/90 disabled:opacity-50"
                          >
                            <X className="size-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => fileInputs.current[slot]?.click()}
                          className="flex size-full flex-col items-center justify-center gap-1.5 rounded-md bg-inner px-2 text-center text-soft transition-colors active:bg-control disabled:opacity-50"
                        >
                          <span className="flex size-9 items-center justify-center rounded-full bg-control text-muted">
                            <Camera className="size-4" />
                          </span>
                          <span className="text-xs font-semibold text-foreground">{label}</span>
                          <span className="text-[11px] text-muted">
                            <Text ro="+ Adaugă" en="+ Add" />
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
                <CheckinPhotoStrip photoUrls={item.photoUrls} />
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

      {previewSlot && lightboxInitialIndex >= 0 && (
        <CheckinPhotoLightbox
          items={lightboxItems}
          initialIndex={lightboxInitialIndex}
          onClose={() => setPreviewSlot(null)}
        />
      )}
    </div>
  );
}
