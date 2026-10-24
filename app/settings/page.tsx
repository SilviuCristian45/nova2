import { Text } from "@/app/components/language-provider"
import { getLanguage } from "@/app/language"
import { createClient } from "@/lib/supabase/server"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { AccountForms, DangerZone, DataPortability, ProfileForm } from "./settings-forms"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const { t } = await getLanguage()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, height_cm, birth_date, sex, weight_unit, daily_steps_goal")
    .eq("id", user.id)
    .maybeSingle()

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <header className="flex items-center gap-3 mt-4">
        <Link href="/" aria-label={t("Înapoi", "Back")} className="rounded-xl border border-zinc-200 bg-zinc-100 p-2.5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight"><Text ro="Setări" en="Settings" /></h1>
      </header>

      <ProfileForm profile={{
        displayName: profile?.display_name ?? "",
        heightCm: profile?.height_cm?.toString() ?? "",
        birthDate: profile?.birth_date ?? "",
        sex: profile?.sex ?? "",
        weightUnit: profile?.weight_unit ?? "kg",
        dailyStepsGoal: profile?.daily_steps_goal ?? 10000,
      }} />
      <AccountForms email={user.email ?? ""} />
      <DataPortability />
      <DangerZone email={user.email ?? ""} />
    </main>
  )
}
