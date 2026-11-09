import { Text } from "@/app/components/language-provider"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Screen } from "@/app/components/ui"
import { AccountForms, DangerZone, DataPortability, ProfileForm } from "./settings-forms"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, height_cm, birth_date, sex, weight_unit, daily_steps_goal")
    .eq("id", user.id)
    .maybeSingle()

  return (
    <Screen title={<Text ro="Setări" en="Settings" />}>
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
    </Screen>
  )
}
