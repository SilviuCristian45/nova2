// Automatic Google Drive backups: how often one is due and running it. The upload is passed in, so this file
// knows nothing about the network or the database and runs in `node --test` (ported from nova3's backup/auto.ts).

export const AUTO_BACKUP_FREQUENCIES = ["off", "daily", "weekly", "monthly"] as const;
export type AutoBackupFrequency = (typeof AUTO_BACKUP_FREQUENCIES)[number];

// How many backups stay in Drive; older ones are deleted after each successful upload.
export const AUTO_BACKUP_KEEP = 5;

const DAY_MS = 24 * 60 * 60 * 1000;
const INTERVAL_MS: Record<Exclude<AutoBackupFrequency, "off">, number> = { daily: DAY_MS, weekly: 7 * DAY_MS, monthly: 30 * DAY_MS };

export function isAutoBackupFrequency(value: unknown): value is AutoBackupFrequency {
  return typeof value === "string" && (AUTO_BACKUP_FREQUENCIES as readonly string[]).includes(value);
}

export function isBackupDue(frequency: AutoBackupFrequency, lastAt: string | null, now: Date): boolean {
  if (frequency === "off") return false;
  const last = lastAt ? Date.parse(lastAt) : NaN;
  if (Number.isNaN(last)) return true;
  // A clock set back in time must not stop backups for months.
  if (last > now.getTime()) return true;
  return now.getTime() - last >= INTERVAL_MS[frequency];
}

// workout-tracker-backup-YYYY-MM-DD-HHMM.json, in UTC (the same names as the mobile app).
export function backupFileName(now: Date): string {
  const iso = now.toISOString();
  return `workout-tracker-backup-${iso.slice(0, 10)}-${iso.slice(11, 16).replace(":", "")}.json`;
}

export type AutoBackupState = { frequency: AutoBackupFrequency; lastAt: string | null; lastError: string | null };
export type AutoBackupResult = { status: "skipped" } | { status: "uploaded"; name: string } | { status: "failed"; message: string };

// Uploads a backup when one is due (or always, with `force`) and returns the state to store. The last-backup time
// moves only after a successful upload, so a failure is retried on the next run; the error is kept until then.
export async function runAutoBackup(
  state: AutoBackupState, upload: (name: string) => Promise<void>, now = new Date(), force = false,
): Promise<{ result: AutoBackupResult; state: AutoBackupState }> {
  if (!force && !isBackupDue(state.frequency, state.lastAt, now)) return { result: { status: "skipped" }, state };
  const name = backupFileName(now);
  try {
    await upload(name);
    return { result: { status: "uploaded", name }, state: { ...state, lastAt: now.toISOString(), lastError: null } };
  } catch (caught) {
    const message = (caught instanceof Error ? caught.message : String(caught)).slice(0, 1000);
    return { result: { status: "failed", message }, state: { ...state, lastError: message } };
  }
}

export type DriveFile = { id: string; name: string; createdTime: string };

// The backups to delete after an upload: everything beyond the newest `keep`.
export function filesToPrune(files: DriveFile[], keep = AUTO_BACKUP_KEEP): DriveFile[] {
  return [...files].sort((a, b) => Date.parse(b.createdTime) - Date.parse(a.createdTime)).slice(keep);
}
