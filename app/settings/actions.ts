"use server"

import { getLanguage } from "@/app/language"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"

export type ActionResult = { error?: string; success?: boolean; message?: string }

export async function updateProfile(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { t } = await getLanguage()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: t("Neautorizat", "Not signed in") }

  const text = (name: string) => String(formData.get(name) ?? "").trim()
  const displayName = text("displayName")
  const height = text("heightCm")
  const birthDate = text("birthDate")
  const sex = text("sex")
  const weightUnit = text("weightUnit")
  const goal = Number(text("dailyStepsGoal"))

  if (displayName.length > 80) return { error: t("Numele poate avea maxim 80 de caractere.", "The name can have at most 80 characters.") }
  const heightCm = height ? Number(height) : null
  if (heightCm !== null && !(heightCm >= 50 && heightCm <= 272)) {
    return { error: t("Înălțimea trebuie să fie între 50 și 272 cm.", "Height must be between 50 and 272 cm.") }
  }
  if (birthDate && !(/^\d{4}-\d{2}-\d{2}$/.test(birthDate) && birthDate >= "1900-01-01" && birthDate <= new Date().toISOString().slice(0, 10))) {
    return { error: t("Data nașterii nu este validă.", "The birth date is not valid.") }
  }
  if (sex && sex !== "male" && sex !== "female") return { error: t("Valoare invalidă pentru sex.", "Invalid value for sex.") }
  if (weightUnit !== "kg" && weightUnit !== "lb") return { error: t("Unitate de măsură invalidă.", "Invalid unit.") }
  if (!Number.isInteger(goal) || goal <= 0 || goal > 1000000) {
    return { error: t("Targetul trebuie să fie un număr pozitiv", "The goal must be a positive number") }
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName || null,
      height_cm: heightCm,
      birth_date: birthDate || null,
      sex: sex || null,
      weight_unit: weightUnit,
      daily_steps_goal: goal,
    })
    .eq("id", user.id)

  if (error) return { error: error.message }

  revalidatePath("/", "layout")
  return { success: true, message: t("Profil salvat.", "Profile saved.") }
}

export async function updateEmail(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { t } = await getLanguage()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: t("Neautorizat", "Not signed in") }

  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: t("Email invalid.", "Invalid email.") }
  if (email === user.email) return { error: t("Acesta este deja emailul contului.", "This is already your account email.") }

  const { error } = await supabase.auth.updateUser({ email })
  if (error) return { error: error.message }
  return {
    success: true,
    message: t("Verifică inbox-ul pentru linkul de confirmare.", "Check your inbox for the confirmation link."),
  }
}

export async function updatePassword(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { t } = await getLanguage()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: t("Neautorizat", "Not signed in") }

  const password = String(formData.get("password") ?? "")
  if (password.length < 8) return { error: t("Parola trebuie să aibă minim 8 caractere.", "The password must have at least 8 characters.") }
  if (password !== String(formData.get("confirmPassword") ?? "")) {
    return { error: t("Parolele nu coincid.", "The passwords do not match.") }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }
  return { success: true, message: t("Parola a fost schimbată.", "Password changed.") }
}

// Danger zone: the user must type their email to confirm both actions.
async function confirmedUser(confirmation: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const confirmed = !!user?.email && confirmation.trim().toLowerCase() === user.email.toLowerCase()
  return { supabase, user, confirmed }
}

export async function deleteAllData(confirmation: string): Promise<ActionResult> {
  const { t } = await getLanguage()
  const { supabase, user, confirmed } = await confirmedUser(confirmation)
  if (!user) return { error: t("Neautorizat", "Not signed in") }
  if (!confirmed) return { error: t("Emailul introdus nu se potrivește.", "The email you typed does not match.") }

  const { error } = await supabase.rpc("delete_my_data")
  if (error) return { error: error.message }

  revalidatePath("/", "layout")
  return { success: true }
}

export async function deleteAccount(confirmation: string): Promise<ActionResult> {
  const { t } = await getLanguage()
  const { supabase, user, confirmed } = await confirmedUser(confirmation)
  if (!user) return { error: t("Neautorizat", "Not signed in") }
  if (!confirmed) return { error: t("Emailul introdus nu se potrivește.", "The email you typed does not match.") }

  // Hard delete: every table cascades from auth.users, so this erases all of the user's rows.
  try {
    const { error } = await createAdminClient().auth.admin.deleteUser(user.id)
    if (error) throw error
  } catch (error) {
    console.error("Account deletion failed:", error)
    return { error: t("Contul nu a putut fi șters. Încearcă din nou.", "The account could not be deleted. Please try again.") }
  }

  // The session belongs to a user that no longer exists; drop the auth cookies.
  await supabase.auth.signOut({ scope: "local" })
  return { success: true }
}
