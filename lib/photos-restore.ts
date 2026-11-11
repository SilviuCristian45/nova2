import type { SupabaseClient } from "@supabase/supabase-js";
import { drivePhotoName, parsePhotoRow, PHOTO_BUCKET } from "./photos.ts";

export type PhotoRestoreResult = { restored: number; missing: number; skipped: number };

type DriveSource = {
  listPhotos(): Promise<{ id: string; name: string }[]>;
  downloadBytes(id: string): Promise<Uint8Array>;
};

// Puts the photos of a Drive backup back: for every photo row of the backup that the account does not have yet, the
// image is read from Drive (replog-photo-<id>.jpg), stored in the bucket and its row inserted, all with the user's own
// session, so the same policies as a normal upload apply. Photos that are already there are left alone; photos whose
// file is not in Drive (or rows that are not valid) are counted, not fatal. Stops at `deadline` (a timestamp in ms):
// the rest is picked up by restoring again.
export async function restorePhotos(
  supabase: SupabaseClient, drive: DriveSource, userId: string, rawRows: unknown, deadline = Infinity,
): Promise<PhotoRestoreResult> {
  const result: PhotoRestoreResult = { restored: 0, missing: 0, skipped: 0 };
  const rows = (Array.isArray(rawRows) ? rawRows : []).map((row) => parsePhotoRow(row, userId));
  const valid = rows.filter((row) => row !== null);
  result.skipped = rows.length - valid.length;
  if (valid.length === 0) return result;

  const existing = new Set<string>();
  for (let i = 0; i < valid.length; i += 100) {
    const { data, error } = await supabase.from("progress_photos").select("id").eq("user_id", userId).in("id", valid.slice(i, i + 100).map((row) => row.id));
    if (error) throw new Error(`progress_photos: ${error.message}`);
    for (const row of data ?? []) existing.add(row.id as string);
  }

  const files = new Map((await drive.listPhotos()).map((file) => [file.name, file.id]));
  for (const photo of valid) {
    if (existing.has(photo.id)) continue;
    if (Date.now() > deadline) break;
    const fileId = files.get(drivePhotoName(photo.id));
    if (!fileId) { result.missing++; continue; }
    const bytes = await drive.downloadBytes(fileId);
    const upload = await supabase.storage.from(PHOTO_BUCKET).upload(photo.path, bytes, { contentType: "image/jpeg", upsert: true });
    if (upload.error) throw new Error(`progress photos: ${upload.error.message}`);
    const { error } = await supabase.from("progress_photos").insert({ ...photo, user_id: userId });
    if (error) {
      await supabase.storage.from(PHOTO_BUCKET).remove([photo.path]);
      throw new Error(`progress_photos: ${error.message}`);
    }
    result.restored++;
  }
  return result;
}
