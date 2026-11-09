import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { AUTO_BACKUP_KEEP, backupFileName, filesToPrune, isAutoBackupFrequency, isBackupDue, runAutoBackup } from "./drive-backup.ts";
import { decryptToken, encryptToken } from "./drive-token.ts";

const now = new Date("2026-11-10T12:00:00.000Z");
const ago = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();
const state = (frequency, lastAt = null, lastError = null) => ({ frequency, lastAt, lastError });

test("a backup is due once the chosen interval has passed", () => {
  assert.equal(isBackupDue("off", null, now), false);
  assert.equal(isBackupDue("daily", null, now), true);
  assert.equal(isBackupDue("daily", ago(0.5), now), false);
  assert.equal(isBackupDue("daily", ago(1), now), true);
  assert.equal(isBackupDue("weekly", ago(6), now), false);
  assert.equal(isBackupDue("weekly", ago(7), now), true);
  assert.equal(isBackupDue("monthly", ago(29), now), false);
  assert.equal(isBackupDue("monthly", ago(30), now), true);
});

test("a last backup in the future or an unreadable date counts as due", () => {
  assert.equal(isBackupDue("monthly", ago(-3), now), true);
  assert.equal(isBackupDue("weekly", "garbage", now), true);
});

test("backup files are named in UTC like the mobile app", () => {
  assert.equal(backupFileName(now), "workout-tracker-backup-2026-11-10-1200.json");
  assert.equal(backupFileName(new Date("2026-01-02T03:04:59.999Z")), "workout-tracker-backup-2026-01-02-0304.json");
});

test("only the four frequencies are accepted and five backups are kept", () => {
  for (const value of ["off", "daily", "weekly", "monthly"]) assert.equal(isAutoBackupFrequency(value), true);
  for (const value of ["hourly", "", null, 1]) assert.equal(isAutoBackupFrequency(value), false);
  assert.equal(AUTO_BACKUP_KEEP, 5);
});

test("runAutoBackup uploads when due and moves the last-backup time", async () => {
  const names = [];
  const upload = async (name) => { names.push(name); };
  const first = await runAutoBackup(state("weekly", ago(8), "old error"), upload, now);
  assert.deepEqual(first.result, { status: "uploaded", name: "workout-tracker-backup-2026-11-10-1200.json" });
  assert.deepEqual(first.state, state("weekly", now.toISOString(), null));

  const next = new Date(now.getTime() + 86_400_000);
  assert.equal((await runAutoBackup(first.state, upload, next)).result.status, "skipped");
  assert.equal((await runAutoBackup(first.state, upload, next, true)).result.status, "uploaded");
  assert.equal(names.length, 2);
});

test("a failed upload keeps the backup due and records the error", async () => {
  const failed = await runAutoBackup(state("daily", ago(2)), async () => { throw new Error("offline"); }, now);
  assert.deepEqual(failed.result, { status: "failed", message: "offline" });
  assert.deepEqual(failed.state, state("daily", ago(2), "offline"));
  const retried = await runAutoBackup(failed.state, async () => undefined, now);
  assert.equal(retried.result.status, "uploaded");
  assert.equal(retried.state.lastError, null);
});

test("turning backups off never uploads", async () => {
  const result = await runAutoBackup(state("off"), async () => { throw new Error("must not run"); }, now);
  assert.equal(result.result.status, "skipped");
});

test("only the newest five backups are kept", () => {
  const files = Array.from({ length: 7 }, (_, i) => ({ id: `f${i}`, name: `b${i}`, createdTime: ago(i) })).reverse();
  assert.deepEqual(filesToPrune(files).map((file) => file.id), ["f5", "f6"]);
  assert.deepEqual(filesToPrune(files.slice(0, 3)), []);
});

test("refresh tokens round-trip through AES-GCM and reject tampering or a wrong key", () => {
  const rawKey = randomBytes(32).toString("base64");
  const stored = encryptToken("1//refresh-token", rawKey);
  assert.notEqual(stored, encryptToken("1//refresh-token", rawKey)); // random IV
  assert.equal(decryptToken(stored, rawKey), "1//refresh-token");
  const tampered = Buffer.from(stored, "base64");
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptToken(tampered.toString("base64"), rawKey));
  assert.throws(() => decryptToken(stored, randomBytes(32).toString("base64")));
  assert.throws(() => encryptToken("x", randomBytes(16).toString("base64")), /32 bytes/);
});
