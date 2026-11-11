import "server-only"
import { createAdminClient } from "./supabase/admin"
import { buildExport } from "./account-export"
import { isAutoBackupFrequency, runAutoBackup, type AutoBackupFrequency, type AutoBackupResult } from "./drive-backup"
import { decryptToken, encryptToken } from "./drive-token"
import { drivePhotoName, PHOTO_BUCKET } from "./photos"
import { DriveClient, driveConfigured, revokeToken } from "./google-drive"

// The google_drive_backups table is service-role only, so everything that touches it lives here. The browser only
// ever receives DriveStatus: never the refresh token.

type Row = {
  user_id: string
  email: string | null
  refresh_token: string
  frequency: string
  last_backup_at: string | null
  last_error: string | null
}

export type DriveStatus = {
  connected: boolean
  email: string | null
  frequency: AutoBackupFrequency
  lastBackupAt: string | null
  lastError: string | null
}

const DISCONNECTED: DriveStatus = { connected: false, email: null, frequency: "off", lastBackupAt: null, lastError: null }

function toStatus(row: Row | null): DriveStatus {
  if (!row) return DISCONNECTED
  return {
    connected: true,
    email: row.email,
    frequency: isAutoBackupFrequency(row.frequency) ? row.frequency : "off",
    lastBackupAt: row.last_backup_at,
    lastError: row.last_error,
  }
}

async function readRow(userId: string): Promise<Row | null> {
  const { data, error } = await createAdminClient().from("google_drive_backups").select("*").eq("user_id", userId).maybeSingle()
  if (error) throw new Error(`google_drive_backups: ${error.message}`)
  return data as Row | null
}

export async function getDriveStatus(userId: string): Promise<DriveStatus> {
  if (!driveConfigured()) return DISCONNECTED
  return toStatus(await readRow(userId))
}

// Stores a new link (or a new token for an existing one), keeping the chosen frequency and history.
export async function saveDriveLink(userId: string, refreshToken: string, email: string | null): Promise<void> {
  const previous = await readRow(userId)
  const { error } = await createAdminClient().from("google_drive_backups").upsert({
    user_id: userId, email, refresh_token: encryptToken(refreshToken), last_error: null,
  }, { onConflict: "user_id" })
  if (error) throw new Error(`google_drive_backups: ${error.message}`)
  if (previous) {
    const old = safeDecrypt(previous.refresh_token)
    if (old && old !== refreshToken) await revokeToken(old)
  }
}

function safeDecrypt(stored: string): string | null {
  try { return decryptToken(stored) } catch { return null }
}

// Disconnect / delete data / delete account: revoke the Google token, then forget the link.
// Revocation is best effort; the row is removed either way.
export async function removeDriveLink(userId: string): Promise<void> {
  if (!driveConfigured()) return
  const row = await readRow(userId).catch(() => null)
  if (!row) return
  const token = safeDecrypt(row.refresh_token)
  if (token) await revokeToken(token)
  const { error } = await createAdminClient().from("google_drive_backups").delete().eq("user_id", userId)
  if (error) throw new Error(`google_drive_backups: ${error.message}`)
}

export async function setDriveFrequency(userId: string, frequency: AutoBackupFrequency): Promise<void> {
  const changes: Partial<Row> = { frequency }
  if (frequency === "off") changes.last_error = null
  const { error } = await createAdminClient().from("google_drive_backups").update(changes).eq("user_id", userId)
  if (error) throw new Error(`google_drive_backups: ${error.message}`)
}

export async function driveClientFor(userId: string): Promise<DriveClient> {
  const row = await readRow(userId)
  if (!row) throw new Error("Google Drive is not connected")
  return new DriveClient(decryptToken(row.refresh_token))
}

// Runs one backup for a stored link: when due, or always with `force`. The export is built with the service-role
// client (every query filters on the user id) and is the same replog-export file as the manual download.
export async function backupRow(row: Row, force = false, now = new Date()): Promise<AutoBackupResult> {
  const admin = createAdminClient()
  const frequency = isAutoBackupFrequency(row.frequency) ? row.frequency : "off"
  const { result, state } = await runAutoBackup(
    { frequency, lastAt: row.last_backup_at, lastError: row.last_error },
    async (name) => {
      const { data: { user }, error } = await admin.auth.admin.getUserById(row.user_id)
      if (error || !user) throw new Error("Account not found")
      const body = await buildExport(admin, user, { email: row.email, frequency, last_backup_at: row.last_backup_at })
      const drive = new DriveClient(decryptToken(row.refresh_token))
      await drive.uploadAndPrune(name, JSON.stringify(body, null, 2))
      // The JSON backup is already safe; a photo that fails here is retried by the next backup.
      await backupPhotos(drive, admin, (body.progress_photos ?? []) as { id: string; path: string }[])
        .catch((caught) => console.warn("Photos not fully backed up", caught))
    },
    now,
    force,
  )
  if (result.status !== "skipped") {
    const { error } = await admin.from("google_drive_backups")
      .update({ last_backup_at: state.lastAt, last_error: state.lastError }).eq("user_id", row.user_id)
    if (error) console.error("Drive backup state not saved:", error)
  }
  return result
}

// At most this many new photos are uploaded per backup, so one run stays within the route's time limit.
const PHOTOS_PER_BACKUP = 40

// Photos are not part of the JSON: each one is a separate file, uploaded once (the file name holds the photo id).
async function backupPhotos(drive: DriveClient, admin: ReturnType<typeof createAdminClient>, photos: { id: string; path: string }[]) {
  if (photos.length === 0) return
  const stored = new Set((await drive.listPhotos()).map((file) => file.name))
  let uploaded = 0
  for (const photo of photos) {
    if (stored.has(drivePhotoName(photo.id))) continue
    if (uploaded++ >= PHOTOS_PER_BACKUP) return
    const { data, error } = await admin.storage.from(PHOTO_BUCKET).download(photo.path)
    if (error || !data) throw new Error(`photo ${photo.id}: ${error?.message ?? "missing"}`)
    await drive.uploadPhoto(drivePhotoName(photo.id), Buffer.from(await data.arrayBuffer()))
  }
}

// Deleting the data or the account also removes the photo copies from the user's Drive (best effort, before the token
// is revoked). The JSON backups are left alone, like on disconnect.
export async function purgeDrivePhotos(userId: string): Promise<void> {
  if (!driveConfigured()) return
  const row = await readRow(userId).catch(() => null)
  if (!row) return
  const drive = new DriveClient(decryptToken(row.refresh_token))
  for (const file of await drive.listPhotos()) await drive.deleteBackup(file.id)
}

export async function backupUser(userId: string, force: boolean): Promise<AutoBackupResult> {
  const row = await readRow(userId)
  if (!row) throw new Error("Google Drive is not connected")
  return backupRow(row, force)
}

// Hourly cron: enabled links, oldest backup first, one at a time, until the time budget runs out. At most 1000 rows
// per run (one Supabase page); since the most overdue come first, the rest are picked up by the next run.
export async function backupAllDue(budgetMs: number): Promise<{ uploaded: number; failed: number; skipped: number; remaining: number }> {
  const started = Date.now()
  const { data, error } = await createAdminClient().from("google_drive_backups").select("*").neq("frequency", "off").order("last_backup_at", { ascending: true, nullsFirst: true }).range(0, 999)
  if (error) throw new Error(`google_drive_backups: ${error.message}`)
  const rows = (data ?? []) as Row[]
  const counts = { uploaded: 0, failed: 0, skipped: 0, remaining: 0 }
  for (const [index, row] of rows.entries()) {
    if (Date.now() - started > budgetMs) {
      counts.remaining = rows.length - index
      break
    }
    const result = await backupRow(row).catch((caught) => ({ status: "failed" as const, message: String(caught) }))
    counts[result.status === "uploaded" ? "uploaded" : result.status === "failed" ? "failed" : "skipped"]++
  }
  return counts
}
