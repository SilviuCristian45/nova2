"use client"

import { Text, useLanguage } from "@/app/components/language-provider"
import { useOffline } from "@/lib/offline/client"
import { AlertTriangle, Download, Loader2, Upload } from "lucide-react"
import { useActionState, useState, type ReactNode } from "react"
import { deleteAccount, deleteAllData, updateEmail, updatePassword, updateProfile, type ActionResult } from "./actions"

const inputClass = "flex h-11 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/50 px-4 text-sm text-zinc-800 dark:text-zinc-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all shadow-inner"
const labelClass = "text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1"
const buttonClass = "flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 transition-all active:scale-95"

function Section({ title, children, danger = false }: { title: ReactNode; children: ReactNode; danger?: boolean }) {
  return (
    <section className={`rounded-2xl border p-5 flex flex-col gap-4 ${danger
      ? "border-red-500/40 bg-red-500/5"
      : "border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-100 dark:bg-zinc-900/60"}`}>
      <h2 className={`text-lg font-bold ${danger ? "text-red-700 dark:text-red-400" : ""}`}>{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className={labelClass}>{label}</span>{children}</label>
}

function Status({ state }: { state: ActionResult }) {
  if (state.error) return <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">{state.error}</p>
  if (state.message) return <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{state.message}</p>
  return null
}

function Submit({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={pending} className={buttonClass}>
      {pending && <Loader2 className="size-4 animate-spin" />}{children}
    </button>
  )
}

type Profile = {
  displayName: string; heightCm: string; birthDate: string
  sex: string; weightUnit: string; dailyStepsGoal: number
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const { t } = useLanguage()
  const [state, action, pending] = useActionState(updateProfile, {})

  return (
    <Section title={<Text ro="Profil" en="Profile" />}>
      <form action={action} className="grid gap-4 sm:grid-cols-2">
        <Field label={<Text ro="Nume afișat" en="Display name" />}>
          <input name="displayName" defaultValue={profile.displayName} maxLength={80} className={inputClass} />
        </Field>
        <Field label={<Text ro="Înălțime (cm)" en="Height (cm)" />}>
          <input name="heightCm" type="number" inputMode="decimal" step="0.1" min="50" max="272" defaultValue={profile.heightCm} className={inputClass} />
        </Field>
        <Field label={<Text ro="Data nașterii" en="Birth date" />}>
          <input name="birthDate" type="date" min="1900-01-01" defaultValue={profile.birthDate} className={inputClass} />
        </Field>
        <Field label={<Text ro="Sex" en="Sex" />}>
          <select name="sex" defaultValue={profile.sex} className={inputClass}>
            <option value="">{t("Nespecificat", "Not specified")}</option>
            <option value="male">{t("Masculin", "Male")}</option>
            <option value="female">{t("Feminin", "Female")}</option>
          </select>
        </Field>
        <Field label={<Text ro="Unitate greutate" en="Weight unit" />}>
          <select name="weightUnit" defaultValue={profile.weightUnit} className={inputClass}>
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </select>
        </Field>
        <Field label={<Text ro="Obiectiv zilnic de pași" en="Daily steps goal" />}>
          <input name="dailyStepsGoal" type="number" inputMode="numeric" min="1" required defaultValue={profile.dailyStepsGoal} className={inputClass} />
        </Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Submit pending={pending}><Text ro="Salvează profilul" en="Save profile" /></Submit>
          <Status state={state} />
        </div>
      </form>
    </Section>
  )
}

export function AccountForms({ email }: { email: string }) {
  const [emailState, emailAction, emailPending] = useActionState(updateEmail, {})
  const [passwordState, passwordAction, passwordPending] = useActionState(updatePassword, {})

  return (
    <Section title={<Text ro="Cont" en="Account" />}>
      <form action={emailAction} className="flex flex-col gap-3">
        <Field label={<Text ro="E-mail" en="Email" />}>
          <input name="email" type="email" required defaultValue={email} autoComplete="email" className={inputClass} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Submit pending={emailPending}><Text ro="Schimbă emailul" en="Change email" /></Submit>
          <Status state={emailState} />
        </div>
      </form>
      <form action={passwordAction} className="grid gap-3 sm:grid-cols-2">
        <Field label={<Text ro="Parolă nouă" en="New password" />}>
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
        </Field>
        <Field label={<Text ro="Confirmă parola" en="Confirm password" />}>
          <input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
        </Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Submit pending={passwordPending}><Text ro="Schimbă parola" en="Change password" /></Submit>
          <Status state={passwordState} />
        </div>
      </form>
    </Section>
  )
}

export function DataPortability() {
  const { t } = useLanguage()
  const offline = useOffline()
  const [pending, setPending] = useState(false)
  const [state, setState] = useState<ActionResult>({})

  async function importFile(file: File) {
    setPending(true)
    setState({})
    try {
      const response = await fetch("/api/account/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: file,
      })
      const result = await response.json()
      if (!response.ok) { setState({ error: result.error ?? t("Importul a eșuat.", "Import failed.") }); return }
      const counts = result.counts as Record<string, number>
      const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
      setState({ message: t(`Import reușit: ${total} înregistrări noi (${counts.workouts} antrenamente, ${counts.meals} mese).`,
        `Import complete: ${total} new records (${counts.workouts} workouts, ${counts.meals} meals).`) })
      // Refresh this device's offline copy with the imported history.
      await offline.sync()
    } catch (error) {
      setState({ error: error instanceof Error ? error.message : t("Importul a eșuat.", "Import failed.") })
    } finally {
      setPending(false)
    }
  }

  return (
    <Section title={<Text ro="Datele tale" en="Your data" />}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold"><Text ro="Exportă datele" en="Export data" /></p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <Text ro="Un fișier JSON cu profilul, antrenamentele, seturile, mesele, pașii și greutatea." en="A JSON file with your profile, workouts, sets, meals, steps and weight." />
          </p>
        </div>
        <a href="/api/account/export" download className={`${buttonClass} shrink-0`}>
          <Download className="size-4" /><Text ro="Descarcă" en="Download" />
        </a>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold"><Text ro="Importă datele" en="Import data" /></p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <Text ro="Adaugă datele dintr-un export RepLog. Datele existente nu sunt suprascrise, iar un fișier importat de două ori nu se dublează." en="Adds the data from a RepLog export. Existing entries are not overwritten, and importing a file twice does not duplicate it." />
          </p>
        </div>
        <label className={`${buttonClass} shrink-0 cursor-pointer ${pending ? "pointer-events-none opacity-50" : ""}`}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          <Text ro="Alege fișierul" en="Choose file" />
          <input type="file" accept="application/json,.json" className="sr-only" disabled={pending}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) void importFile(file)
            }} />
        </label>
      </div>
      <Status state={state} />
    </Section>
  )
}

type DangerAction = "data" | "account"

export function DangerZone({ email }: { email: string }) {
  const { t } = useLanguage()
  const offline = useOffline()
  const [open, setOpen] = useState<DangerAction | null>(null)
  const [confirmation, setConfirmation] = useState("")
  const [pending, setPending] = useState(false)
  const [state, setState] = useState<ActionResult>({})

  function choose(next: DangerAction | null) {
    setOpen(next)
    setConfirmation("")
    setState({})
  }

  async function run() {
    if (!open) return
    setPending(true)
    setState({})
    try {
      const result = open === "account" ? await deleteAccount(confirmation) : await deleteAllData(confirmation)
      if (result.error) { setState(result); return }
      // The server copy is gone; drop this device's offline copy and unsynced queue too.
      await offline.forget()
      if (open === "account") {
        window.location.assign("/login")
        return
      }
      await offline.sync()
      choose(null)
      setState({ message: t("Toate datele au fost șterse.", "All your data was deleted.") })
    } catch (error) {
      setState({ error: error instanceof Error ? error.message : t("Operația a eșuat.", "The operation failed.") })
    } finally {
      setPending(false)
    }
  }

  const matches = confirmation.trim().toLowerCase() === email.toLowerCase()

  return (
    <Section danger title={<span className="flex items-center gap-2"><AlertTriangle className="size-5" /><Text ro="Zonă periculoasă" en="Danger zone" /></span>}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold"><Text ro="Șterge toate datele" en="Delete all data" /></p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <Text ro="Antrenamente, mese, pași, greutate și alimente proprii. Contul și profilul rămân." en="Workouts, meals, steps, weight and your own foods. Your account and profile stay." />
          </p>
        </div>
        <button type="button" onClick={() => choose("data")} disabled={pending}
          className="h-10 shrink-0 rounded-xl border border-red-500/50 px-4 text-sm font-bold text-red-700 hover:bg-red-500/10 dark:text-red-400">
          <Text ro="Șterge datele" en="Delete data" />
        </button>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold"><Text ro="Șterge contul" en="Delete account" /></p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <Text ro="Șterge definitiv contul și toate datele asociate. Acțiunea nu poate fi anulată." en="Permanently deletes your account and all associated data. This cannot be undone." />
          </p>
        </div>
        <button type="button" onClick={() => choose("account")} disabled={pending}
          className="h-10 shrink-0 rounded-xl bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-500">
          <Text ro="Șterge contul" en="Delete account" />
        </button>
      </div>

      {open && (
        <form onSubmit={(event) => { event.preventDefault(); void run() }}
          className="flex flex-col gap-3 rounded-xl border border-red-500/40 bg-white p-4 dark:bg-zinc-950/60">
          <p className="text-sm font-medium">
            {open === "account"
              ? t("Pentru a șterge definitiv contul, scrie emailul tău:", "To permanently delete your account, type your email:")
              : t("Pentru a șterge toate datele, scrie emailul tău:", "To delete all your data, type your email:")}
            {" "}<span className="font-mono font-bold break-all">{email}</span>
          </p>
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
            type="email" autoComplete="off" aria-label={t("Confirmă emailul", "Confirm email")} className={inputClass} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={!matches || pending}
              className="flex h-10 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50">
              {pending && <Loader2 className="size-4 animate-spin" />}
              {open === "account" ? t("Șterge definitiv contul", "Permanently delete account") : t("Șterge toate datele", "Delete all data")}
            </button>
            <button type="button" onClick={() => choose(null)} disabled={pending}
              className="h-10 rounded-xl border border-zinc-200 px-4 text-sm font-medium dark:border-zinc-800">
              <Text ro="Anulează" en="Cancel" />
            </button>
          </div>
        </form>
      )}
      <Status state={state} />
    </Section>
  )
}
