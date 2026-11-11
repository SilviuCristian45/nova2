import type { SupabaseClient } from "@supabase/supabase-js";

// Progress photos: JPEGs in the private Storage bucket, metadata in `progress_photos`. Limits match the migration.
export const PHOTO_BUCKET = "progress-photos";
export const PHOTO_POSES = ["front", "side", "back", "other"] as const;
export type PhotoPose = (typeof PHOTO_POSES)[number];
export const PHOTO_NOTE_MAX = 280;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_MAX_PER_USER = 200;
// Photos are shrunk in the browser before upload: long edge at most this many pixels.
export const PHOTO_MAX_EDGE = 1600;

export type PhotoRow = { id: string; taken_on: string; pose: PhotoPose; note: string | null; path: string; size_bytes: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isPhotoPose = (value: unknown): value is PhotoPose =>
  typeof value === "string" && (PHOTO_POSES as readonly string[]).includes(value);

export const photoPath = (userId: string, id: string) => `${userId}/${id}.jpg`;

// The file a photo gets in the Google Drive backup (next to the JSON backups).
export const drivePhotoName = (id: string) => `replog-photo-${id}.jpg`;

export function fitWithin(width: number, height: number, max = PHOTO_MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// A photo row from an export / Drive backup. The path is derived from the account, never trusted from the file.
export function parsePhotoRow(value: unknown, userId: string): PhotoRow | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const { id, taken_on, pose, note, size_bytes } = row;
  if (typeof id !== "string" || !UUID.test(id)) return null;
  if (typeof taken_on !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(taken_on) || Number.isNaN(Date.parse(taken_on))) return null;
  if (!isPhotoPose(pose)) return null;
  if (note !== null && note !== undefined && (typeof note !== "string" || note.length > PHOTO_NOTE_MAX)) return null;
  if (typeof size_bytes !== "number" || !Number.isInteger(size_bytes) || size_bytes <= 0 || size_bytes > PHOTO_MAX_BYTES) return null;
  const lower = id.toLowerCase();
  return { id: lower, taken_on, pose, note: (note as string | null | undefined) || null, path: photoPath(userId, lower), size_bytes };
}

// Deletes every image file of a user (account / data deletion). Works with the user's own session (the bucket
// policy lets an owner delete their folder) as well as with the service-role client. A missing bucket (migration
// not applied) means there is nothing to delete.
export async function removeAllPhotoFiles(supabase: SupabaseClient, userId: string): Promise<void> {
  const bucket = supabase.storage.from(PHOTO_BUCKET);
  for (;;) {
    const { data, error } = await bucket.list(userId, { limit: 100 });
    if (error) {
      if (/not found|does not exist/i.test(error.message)) return;
      throw new Error(`progress photos: ${error.message}`);
    }
    if (!data || data.length === 0) return;
    const { error: removeError } = await bucket.remove(data.map((file) => `${userId}/${file.name}`));
    if (removeError) throw new Error(`progress photos: ${removeError.message}`);
    if (data.length < 100) return;
  }
}
