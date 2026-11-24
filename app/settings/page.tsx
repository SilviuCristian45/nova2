import { Text } from "@/app/components/language-provider"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Columns, Screen, Stack } from "@/app/components/ui"
import { AccountForms, CoachRoleSection, DangerZone, DataPortability, ProfileForm } from "./settings-forms"
import { DriveBackupSection } from "./drive-backup"
import { driveConfigured } from "@/lib/google-drive"
import { getDriveStatus, type DriveStatus } from "@/lib/drive-service"
import { getCurrentAuthRole, getOwnCoachProfile, isCoachSelfServeEnabled } from "@/lib/coach/auth"

export const dynamic = "force-dynamic"

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ drive?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: profile }, authRole] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, height_cm, birth_date, sex, weight_unit, daily_steps_goal")
      .eq("id", user.id)
      .maybeSingle(),
    getCurrentAuthRole(),
  ])

  const role = authRole?.role ?? "client"
  const migrationMissing = authRole?.migrationMissing ?? false
  const coachProfile = role === "coach" ? await getOwnCoachProfile(user.id) : null
  const allowCoachSelfServe = isCoachSelfServeEnabled()

  // The Drive card appears only when the server has the Google OAuth client (and the keys it needs).
  let drive: DriveStatus | null = null
  if (driveConfigured()) {
    drive = await getDriveStatus(user.id).catch((error) => {
      console.error("Drive status unavailable:", error)
      return null
    })
  }
  const { drive: connectResult } = await searchParams

  return (
    <Screen title={<Text ro="Setări" en="Settings" />}>
      <Columns>
        <Stack>
          <ProfileForm profile={{
            displayName: profile?.display_name ?? "",
            heightCm: profile?.height_cm?.toString() ?? "",
            birthDate: profile?.birth_date ?? "",
            sex: profile?.sex ?? "",
            weightUnit: profile?.weight_unit ?? "kg",
            dailyStepsGoal: profile?.daily_steps_goal ?? 10000,
          }} />
          {(role === "coach" || allowCoachSelfServe) && (
            <CoachRoleSection
              role={role}
              migrationMissing={migrationMissing}
              defaultDisplayName={profile?.display_name ?? ""}
              coachProfile={coachProfile ? {
                displayName: coachProfile.display_name,
                bio: coachProfile.bio ?? "",
                specialties: coachProfile.specialties.join(", "),
                isPublic: coachProfile.is_public,
                acceptingClients: coachProfile.accepting_clients,
              } : null}
            />
          )}
          <AccountForms email={user.email ?? ""} />
        </Stack>
        <Stack>
          <DataPortability />
          {drive && <DriveBackupSection initial={drive} connectResult={connectResult ?? null} />}
          <DangerZone email={user.email ?? ""} />
        </Stack>
      </Columns>
    </Screen>
  )
}
