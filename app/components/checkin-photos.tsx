"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { useLanguage } from "@/app/components/language-provider";
import { IconButton } from "@/app/components/ui";
import {
  CHECKIN_PHOTO_SLOTS,
  type CheckinPhotoSlot,
  type CheckinPhotoUrls,
} from "@/lib/coach/types";
import { PHOTO_MAX_BYTES, fitWithin } from "@/lib/photos";

export function checkinSlotLabel(slot: CheckinPhotoSlot, t: (ro: string, en: string) => string): string {
  switch (slot) {
    case "front":
      return t("Față", "Front");
    case "back":
      return t("Spate", "Back");
    case "side":
      return t("Profil", "Side");
  }
}

// Shrinks a picked image in the browser (long edge at most 1600 px, JPEG, EXIF rotation applied).
export async function resizeCheckinPhotoToJpeg(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("invalid-image");
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("invalid-image");
    ctx.drawImage(bitmap, 0, 0, width, height);
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= PHOTO_MAX_BYTES) return blob;
    }
    throw new Error("too-large");
  } finally {
    bitmap.close();
  }
}

export type PhotoPreviewItem = {
  slot: CheckinPhotoSlot;
  url: string;
};

export function CheckinPhotoLightbox({
  items,
  initialIndex,
  onClose,
}: {
  items: PhotoPreviewItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [index, setIndex] = useState(Math.max(0, Math.min(initialIndex, items.length - 1)));
  const current = items[index];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && items.length > 1) {
        setIndex((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === "ArrowRight" && items.length > 1) {
        setIndex((i) => (i + 1) % items.length);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [items.length, onClose]);

  if (!current) return null;

  const label = checkinSlotLabel(current.slot, t);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 flex flex-col gap-3 overflow-y-auto bg-black/90 p-4"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
        <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">
          {label}
          {items.length > 1 ? ` · ${index + 1}/${items.length}` : ""}
        </span>
        <IconButton icon={X} label={t("Închide", "Close")} onClick={onClose} />
      </div>

      <div
        className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex w-full items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL or local object URL */}
          <img
            src={current.url}
            alt={label}
            className="max-h-[75dvh] w-full rounded-md object-contain"
          />
          {items.length > 1 && (
            <>
              <button
                type="button"
                aria-label={t("Poza anterioară", "Previous photo")}
                onClick={() => setIndex((i) => (i - 1 + items.length) % items.length)}
                className="absolute left-2 flex size-10 items-center justify-center rounded-full bg-black/65 text-white transition-colors active:bg-black/85"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                aria-label={t("Poza următoare", "Next photo")}
                onClick={() => setIndex((i) => (i + 1) % items.length)}
                className="absolute right-2 flex size-10 items-center justify-center rounded-full bg-black/65 text-white transition-colors active:bg-black/85"
              >
                <ChevronRight className="size-5" />
              </button>
            </>
          )}
        </div>

        {items.length > 1 && (
          <div className="flex flex-wrap justify-center gap-2">
            {items.map((item, idx) => (
              <button
                key={item.slot}
                type="button"
                onClick={() => setIndex(idx)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  idx === index ? "bg-lime text-on-solid" : "bg-white/15 text-white"
                }`}
              >
                {checkinSlotLabel(item.slot, t)}
              </button>
            ))}
          </div>
        )}

        {!current.url.startsWith("blob:") && (
          <a
            href={current.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-control px-4 text-sm font-semibold text-foreground"
          >
            <ExternalLink className="size-4" />
            {t("Deschide originalul", "Open full image")}
          </a>
        )}
      </div>
    </div>
  );
}

export function CheckinPhotoStrip({
  photoUrls,
}: {
  photoUrls?: CheckinPhotoUrls;
}) {
  const { t } = useLanguage();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const items: PhotoPreviewItem[] = CHECKIN_PHOTO_SLOTS
    .map((slot) => {
      const url = photoUrls?.[slot];
      return url ? { slot, url } : null;
    })
    .filter((item): item is PhotoPreviewItem => item !== null);

  if (items.length === 0) return null;

  return (
    <>
      <div className="grid max-w-sm grid-cols-3 gap-2 pt-0.5">
        {items.map((item, idx) => {
          const label = checkinSlotLabel(item.slot, t);
          return (
            <button
              key={item.slot}
              type="button"
              onClick={() => setOpenIndex(idx)}
              className="relative aspect-[3/4] overflow-hidden rounded-md bg-control transition-opacity active:opacity-80"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, resized on upload */}
              <img
                src={item.url}
                alt={label}
                loading="lazy"
                className="size-full object-cover"
              />
              <span className="absolute bottom-1 left-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white">
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {openIndex !== null && (
        <CheckinPhotoLightbox
          items={items}
          initialIndex={openIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </>
  );
}
