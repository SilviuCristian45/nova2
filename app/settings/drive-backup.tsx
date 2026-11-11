"use client"

import { useState } from "react"
import { Cloud, CloudUpload, Download, RotateCcw } from "lucide-react"
import { useLanguage } from "@/app/components/language-provider"
import { useOffline } from "@/lib/offline/client"
import { AUTO_BACKUP_KEEP, type AutoBackupFrequency, type AutoBackupResult, type DriveFile } from "@/lib/drive-backup"
import type { DriveStatus } from "@/lib/drive-service"
import { Button, Card, CardTitle, Field, Message, Segmented, buttonClass } from "@/app/components/ui"

type Status = { ok: boolean; text: string } | null

async function call<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? { method: "GET" } : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
  return data as T
}

// Automatic backups to the hidden app folder of the user's Google Drive. The server holds the Google token and
// runs the scheduled backups; this card only shows the state and sends commands.
export function DriveBackupSection({ initial, connectResult }: { initial: DriveStatus; connectResult: string | null }) {
  const { t, locale } = useLanguage()
  const { online } = useOffline()
  const [drive, setDrive] = useState(initial)
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>(() => {
    switch (connectResult) {
      case "connected": return { ok: true, text: t("Google Drive a fost conectat.", "Google Drive is connected.") }
      case "cancelled": return { ok: false, text: t("Conectarea a fost anulată.", "The connection was cancelled.") }
      case "scope": return { ok: false, text: t("Fără acces la Google Drive nu se pot face backup-uri. Reconectează-te și bifează accesul la Drive.", "Backups need access to Google Drive. Connect again and allow Drive access.") }
      case "state": case "error": return { ok: false, text: t("Conectarea a eșuat. Încearcă din nou.", "Could not connect. Please try again.") }
      default: return null
    }
  })

  async function run(name: string, action: () => Promise<void>) {
    setBusy(name)
    setStatus(null)
    try {
      await action()
    } catch (error) {
      setStatus({ ok: false, text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(null)
    }
  }

  function describe(result: AutoBackupResult) {
    if (result.status === "uploaded") setStatus({ ok: true, text: t(`Backup încărcat în Google Drive (${result.name}).`, `Backup uploaded to Google Drive (${result.name}).`) })
    if (result.status === "failed") setStatus({ ok: false, text: t("Backup-ul a eșuat: ", "Backup failed: ") + result.message })
  }

  const chooseFrequency = (frequency: AutoBackupFrequency) => run("frequency", async () => {
    setDrive((current) => ({ ...current, frequency }))
    const data = await call<{ result: AutoBackupResult; status: DriveStatus }>("/api/drive/frequency", { frequency })
    setDrive(data.status)
    describe(data.result)
  })

  const backupNow = () => run("backup", async () => {
    const data = await call<{ result: AutoBackupResult; status: DriveStatus }>("/api/drive/backup", {})
    setDrive(data.status)
    describe(data.result)
  })

  const loadFiles = () => run("list", async () => {
    const data = await call<{ files: DriveFile[] }>("/api/drive/backups")
    setFiles(data.files)
    if (!data.files.length) setStatus({ ok: false, text: t("Nu există backup-uri în Google Drive.", "There are no backups in Google Drive.") })
  })

  const restore = (file: DriveFile) => run(`restore-${file.id}`, async () => {
    const { preview } = await call<{ preview: { exportedAt: string | null; counts: Record<string, number> } }>("/api/drive/restore", { id: file.id })
    const c = preview.counts
    const summary = [
      `${file.name}`,
      new Date(file.createdTime).toLocaleString(locale),
      "",
      t(`Conține: ${c.workouts} antrenamente, ${c.workout_sets} seturi, ${c.cardio_sessions} activități cardio, ${c.meals} mese, ${c.daily_steps} zile cu pași, ${c.daily_weight} cântăriri, ${c.daily_checkin ?? 0} check-in-uri, ${c.progress_photos ?? 0} poze de progres.`,
        `Contains: ${c.workouts} workouts, ${c.workout_sets} sets, ${c.cardio_sessions} cardio entries, ${c.meals} meals, ${c.daily_steps} days of steps, ${c.daily_weight} weigh-ins, ${c.daily_checkin ?? 0} check-ins, ${c.progress_photos ?? 0} progress photos.`),
      "",
      t("Datele se combină cu cele din cont: nimic existent nu se suprascrie, iar ce există deja nu se dublează. Continui?",
        "The data is merged into your account: nothing existing is overwritten and what is already there is not duplicated. Continue?"),
    ].join("\n")
    if (!window.confirm(summary)) {
      setStatus({ ok: true, text: t("Anulat. Nu s-a modificat nimic.", "Cancelled. Nothing changed.") })
      return
    }
    const { counts, photos } = await call<{ counts: Record<string, number>; photos: { restored: number; missing: number; error?: string } | null }>("/api/drive/restore", { id: file.id, confirm: true })
    const total = Object.values(counts ?? {}).reduce((sum, n) => sum + n, 0)
    const base = t(`Datele din Drive au fost combinate cu cele din cont: ${total} înregistrări noi.`, `The Drive data was merged into your account: ${total} new records.`)
    if (photos?.error) {
      setStatus({ ok: false, text: `${base} ${t("Pozele nu au putut fi restaurate complet: ", "The photos could not be fully restored: ")}${photos.error}` })
    } else if (photos) {
      const left = photos.missing > 0 ? t(` ${photos.missing} nu au fost găsite în Drive.`, ` ${photos.missing} were not found in Drive.`) : ""
      setStatus({ ok: true, text: `${base} ${t(`Poze restaurate: ${photos.restored}.`, `Photos restored: ${photos.restored}.`)}${left}` })
    } else {
      setStatus({ ok: true, text: base })
    }
  })

  const disconnect = () => run("disconnect", async () => {
    const data = await call<{ status: DriveStatus }>("/api/drive/disconnect", {})
    setDrive(data.status)
    setFiles(null)
  })

  const disabled = !online || busy !== null
  return (
    <Card id="drive">
      <CardTitle description={t(
        `Backup-ul se urcă într-un folder ascuns al aplicației din Drive-ul tău (aplicația nu vede alte fișiere). Rulează automat pe server, la frecvența aleasă, și se păstrează ultimele ${AUTO_BACKUP_KEEP}. Backup-urile făcute din aplicația de telefon apar în aceeași listă.`,
        `The backup goes to a hidden app folder in your Drive (the app cannot see your other files). It runs automatically on the server at the chosen frequency, and the latest ${AUTO_BACKUP_KEEP} are kept. Backups made by the phone app show up in the same list.`)}>
        {t("Backup automat în Google Drive", "Automatic Google Drive backup")}
      </CardTitle>
      {!online && <Message tone="gold">{t("Ești offline. Backup-ul în Google Drive are nevoie de internet.", "You are offline. Google Drive backup needs an internet connection.")}</Message>}
      {!drive.connected ? (
        <a href="/api/drive/connect" aria-disabled={!online || undefined} className={buttonClass()}>
          <Cloud className="size-[18px]" />{t("Conectează Google Drive", "Connect Google Drive")}
        </a>
      ) : (
        <>
          <p className="font-semibold break-all">{t("Cont: ", "Account: ")}{drive.email ?? "Google"}</p>
          <Field label={t("Frecvență", "Frequency")}>
            <Segmented inCard label={t("Frecvență", "Frequency")} value={drive.frequency}
              onChange={(next) => { if (!disabled) void chooseFrequency(next) }}
              options={[
                { value: "off", label: t("Oprit", "Off") }, { value: "daily", label: t("Zilnic", "Daily") },
                { value: "weekly", label: t("Săptămânal", "Weekly") }, { value: "monthly", label: t("Lunar", "Monthly") },
              ]} />
          </Field>
          <p className="text-[13px] text-soft">
            {drive.lastBackupAt ? t("Ultimul backup: ", "Last backup: ") + new Date(drive.lastBackupAt).toLocaleString(locale) : t("Niciun backup făcut încă.", "No backup yet.")}
          </p>
          {drive.lastError && <Message>{t("Ultima încercare a eșuat: ", "Last attempt failed: ") + drive.lastError}</Message>}
          <Button icon={CloudUpload} onClick={backupNow} busy={busy === "backup"} disabled={disabled}>{t("Fă backup acum", "Back up now")}</Button>
          <Button variant="secondary" icon={Download} onClick={loadFiles} busy={busy === "list"} disabled={disabled}>{t("Backup-urile din Drive", "Backups in Drive")}</Button>
          {files?.map((file) => (
            <div key={file.id} className="flex flex-col gap-2 rounded-md bg-inner p-3.5">
              <p className="break-all text-sm font-semibold">{file.name}</p>
              <p className="text-xs text-muted">{new Date(file.createdTime).toLocaleString(locale)}</p>
              <div className="flex gap-2">
                <Button variant="secondary" small icon={RotateCcw} onClick={() => restore(file)} busy={busy === `restore-${file.id}`} disabled={disabled} className="flex-1">
                  {t("Restaurează", "Restore")}
                </Button>
                <a href={`/api/drive/download?id=${encodeURIComponent(file.id)}&name=${encodeURIComponent(file.name)}`} download={file.name}
                  aria-disabled={!online || undefined} className={buttonClass({ variant: "secondary", small: true, className: "flex-1" })}>
                  <Download className="size-4" />{t("Descarcă", "Download")}
                </a>
              </div>
            </div>
          ))}
          <Button variant="soft" tone="red" onClick={disconnect} busy={busy === "disconnect"} disabled={disabled}>{t("Deconectează", "Disconnect")}</Button>
        </>
      )}
      {status && <Message tone={status.ok ? "lime" : "red"}>{status.text}</Message>}
    </Card>
  )
}
