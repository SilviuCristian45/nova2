"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ExternalLink, GitCompare, Trash2, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { localDate } from "@/lib/daily-metrics";
import {
  PHOTO_BUCKET, PHOTO_MAX_BYTES, PHOTO_MAX_PER_USER, PHOTO_NOTE_MAX, fitWithin, photoPath, type PhotoPose, type PhotoRow,
} from "@/lib/photos";
import { useLanguage } from "@/app/components/language-provider";
import { Button, Card, Empty, Field, IconButton, Input, Message, Segmented } from "@/app/components/ui";

export type GalleryPhoto = PhotoRow & { url: string };

// Shrinks the picked image in the browser (phone photos are several MB): long edge 1600 px, JPEG, EXIF rotation applied.
async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= PHOTO_MAX_BYTES) return blob;
  }
  throw new Error("too-large");
}

const daysBetween = (a: string, b: string) => Math.round(Math.abs(Date.parse(b) - Date.parse(a)) / 86_400_000);

export default function PhotoGallery({ userId, photos }: { userId: string; photos: GalleryPhoto[] }) {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState("");
  const [pose, setPose] = useState<PhotoPose>("front");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PhotoPose | "all">("all");
  const [viewing, setViewing] = useState<GalleryPhoto | null>(null);
  const [comparing, setComparing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const poseLabel: Record<PhotoPose, string> = {
    front: t("Față", "Front"), side: t("Profil", "Side"), back: t("Spate", "Back"), other: t("Altele", "Other"),
  };
  const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const shown = photos.filter((photo) => filter === "all" || photo.pose === filter);
  const groups = [...new Set(shown.map((photo) => photo.taken_on))];
  const chosen = picked.map((id) => photos.find((photo) => photo.id === id)).filter((photo): photo is GalleryPhoto => !!photo)
    .sort((a, b) => a.taken_on.localeCompare(b.taken_on));

  function openForm() {
    setDate(localDate());
    setError(null);
    setAdding(true);
  }

  async function save() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const id = crypto.randomUUID();
    const path = photoPath(userId, id);
    try {
      const blob = await toJpeg(file);
      const upload = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
      if (upload.error) throw new Error(upload.error.message);
      const { error: insertError } = await supabase.from("progress_photos").insert({
        id, user_id: userId, taken_on: date, pose, note: note.trim() || null, path, size_bytes: blob.size,
      });
      if (insertError) {
        await supabase.storage.from(PHOTO_BUCKET).remove([path]);
        throw new Error(insertError.message);
      }
      setFile(null);
      setNote("");
      setAdding(false);
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message === "too-large" ? t("Poza este prea mare.", "The photo is too large.")
        : /row-level security|violates/i.test(message) ? t(`Limita este de ${PHOTO_MAX_PER_USER} de poze.`, `The limit is ${PHOTO_MAX_PER_USER} photos.`)
        : /bucket not found|schema cache|does not exist/i.test(message) ? t("Rulează migrația progress_photos în Supabase.", "Run the progress_photos migration in Supabase.")
        : message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(photo: GalleryPhoto) {
    if (!window.confirm(t("Ștergi poza? Nu se poate anula (o copie din backup-ul Drive rămâne până ștergi contul sau datele).", "Delete this photo? This cannot be undone (a copy in the Drive backup stays until you delete your account or data)."))) return;
    setBusy(true);
    const supabase = createClient();
    // Row first: a photo whose file removal fails stays invisible but is still deleted with the account.
    const { error: rowError } = await supabase.from("progress_photos").delete().eq("id", photo.id);
    if (rowError) setError(rowError.message);
    else {
      await supabase.storage.from(PHOTO_BUCKET).remove([photo.path]);
      setViewing(null);
      setPicked((current) => current.filter((id) => id !== photo.id));
      router.refresh();
    }
    setBusy(false);
  }

  function select(photo: GalleryPhoto) {
    if (!comparing) return setViewing(photo);
    setPicked((current) => current.includes(photo.id) ? current.filter((id) => id !== photo.id) : [...current.slice(-1), photo.id]);
  }

  return (
    <>
      <Card>
        {!adding ? (
          <div className="flex flex-wrap gap-2">
            <Button icon={Camera} onClick={openForm} className="grow">{t("Adaugă poză", "Add photo")}</Button>
            {photos.length >= 2 && (
              <Button variant="secondary" icon={GitCompare} className="grow"
                onClick={() => { setComparing((value) => !value); setPicked([]); }}>
                {comparing ? t("Gata", "Done") : t("Compară", "Compare")}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            <Button variant="secondary" icon={Camera} onClick={() => fileInput.current?.click()}>
              {file ? file.name : t("Alege o poză", "Choose a photo")}
            </Button>
            <Segmented inCard label={t("Poziție", "Pose")} value={pose} onChange={setPose}
              options={(Object.keys(poseLabel) as PhotoPose[]).map((value) => ({ value, label: poseLabel[value] }))} />
            <Field label={t("Data", "Date")} htmlFor="photo-date">
              <Input id="photo-date" type="date" value={date} max={localDate()} onChange={(event) => setDate(event.target.value)} />
            </Field>
            <Field label={t("Notiță (opțional)", "Note (optional)")} htmlFor="photo-note">
              <Input id="photo-note" value={note} maxLength={PHOTO_NOTE_MAX} onChange={(event) => setNote(event.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => { setAdding(false); setFile(null); }}>{t("Anulează", "Cancel")}</Button>
              <Button className="grow" busy={busy} disabled={!file || !date} onClick={save}>{t("Salvează", "Save")}</Button>
            </div>
          </div>
        )}
        {error && <Message>{error}</Message>}
        {comparing && <Message tone="ice">{t("Alege două poze de comparat.", "Pick two photos to compare.")}</Message>}
      </Card>

      {photos.length > 0 && (
        <Segmented label={t("Filtru poziție", "Pose filter")} value={filter} onChange={setFilter}
          options={[{ value: "all" as const, label: t("Toate", "All") }, ...(["front", "side", "back"] as const).map((value) => ({ value, label: poseLabel[value] }))]} />
      )}

      {photos.length === 0 ? (
        <Empty icon={Camera}>{t("Nu ai nicio poză de progres încă.", "You have no progress photos yet.")}</Empty>
      ) : groups.map((day) => (
        <section key={day} className="flex flex-col gap-2">
          <h2 className="px-1 text-[15px] font-semibold">{formatDate(day)}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {shown.filter((photo) => photo.taken_on === day).map((photo) => (
              <button key={photo.id} type="button" onClick={() => select(photo)} aria-pressed={comparing ? picked.includes(photo.id) : undefined}
                className={`relative aspect-[3/4] overflow-hidden rounded-md bg-inner ${picked.includes(photo.id) ? "ring-2 ring-lime" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, already resized on upload */}
                <img src={photo.url} alt={`${poseLabel[photo.pose]} · ${formatDate(photo.taken_on)}`} loading="lazy" className="size-full object-cover" />
                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">{poseLabel[photo.pose]}</span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {(viewing || (comparing && chosen.length === 2)) && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex flex-col gap-3 overflow-y-auto bg-black/90 p-4">
          <div className="flex justify-end">
            <IconButton icon={X} label={t("Închide", "Close")} onClick={() => { setViewing(null); setPicked([]); }} />
          </div>
          {viewing ? (
            <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL */}
              <img src={viewing.url} alt={poseLabel[viewing.pose]} className="max-h-[75dvh] w-full rounded-md object-contain" />
              <p className="text-sm text-white">{formatDate(viewing.taken_on)} · {poseLabel[viewing.pose]}{viewing.note ? ` · ${viewing.note}` : ""}</p>
              <div className="flex gap-2">
                <a href={viewing.url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 grow items-center justify-center gap-2 rounded-full bg-control px-4 text-sm font-semibold">
                  <ExternalLink className="size-[18px]" />{t("Deschide", "Open")}
                </a>
                <Button small variant="danger" icon={Trash2} busy={busy} onClick={() => remove(viewing)}>{t("Șterge", "Delete")}</Button>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                {chosen.map((photo) => (
                  <figure key={photo.id} className="flex flex-col gap-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL */}
                    <img src={photo.url} alt={poseLabel[photo.pose]} className="aspect-[3/4] w-full rounded-md object-cover" />
                    <figcaption className="text-center text-xs text-white">{formatDate(photo.taken_on)} · {poseLabel[photo.pose]}</figcaption>
                  </figure>
                ))}
              </div>
              <p className="text-center text-sm font-semibold text-white">
                {t(`${daysBetween(chosen[0].taken_on, chosen[1].taken_on)} zile între poze`, `${daysBetween(chosen[0].taken_on, chosen[1].taken_on)} days apart`)}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
