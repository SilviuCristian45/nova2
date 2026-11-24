"use server"

import { getLanguage } from "@/app/language"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { rememberWeightUnit } from "@/app/units"
import { isCoachSelfServeEnabled } from "@/lib/coach/auth"
import { parseUserRole, type UserRole } from "@/lib/coach/types"

export type RegisterResult = {
  error?: string
  info?: string
  success?: boolean
  role?: UserRole
}

export async function registerUser(formData: FormData): Promise<RegisterResult> {
  const { t } = await getLanguage()

  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const requestedRole = parseUserRole(formData.get("role"))
  const displayName = String(formData.get("displayName") ?? "").trim()

  if (!email || !password) {
    return { error: t("Te rog să completezi ambele câmpuri.", "Please fill in both fields.") }
  }

  if (password.length < 6) {
    return { error: t("Parola trebuie să aibă cel puțin 6 caractere.", "Password must contain at least 6 characters.") }
  }

  if (displayName.length > 80) {
    return { error: t("Numele poate avea maxim 80 de caractere.", "The name can have at most 80 characters.") }
  }

  if (requestedRole === "coach" && !isCoachSelfServeEnabled()) {
    return {
      error: t(
        "Înregistrarea directă ca antrenor este dezactivată pe acest server.",
        "Self-serve coach registration is disabled on this server.",
      ),
    }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  })

  if (error) {
    return { error: t("Eroare la înregistrare: ", "Could not register: ") + error.message }
  }

  // Contul nou pornește în kg, chiar dacă pe dispozitiv a fost logat alt cont cu lb
  await rememberWeightUnit("kg")

  let finalRole: UserRole = "client"
  if (requestedRole === "coach") {
    if (!data.session) {
      return {
        success: true,
        role: "client",
        info: t(
          "Contul a fost creat. Confirmă adresa de e-mail, autentifică-te, apoi activează rolul de antrenor din Setări.",
          "Account created. Confirm your email, sign in, and then activate Coach mode in Settings.",
        ),
      }
    }

    const { error: coachError } = await supabase.rpc("activate_coach_role", {
      p_display_name: displayName || null,
    })
    if (coachError) {
      return {
        success: true,
        role: "client",
        info: t(
          "Contul a fost creat, dar rolul de antrenor nu a putut fi activat încă (verifică migrația SQL). Îl poți activa ulterior din Setări.",
          "Account created, but Coach mode could not be activated yet (check the SQL migration). You can activate it later in Settings.",
        ),
      }
    }
    finalRole = "coach"
  }

  revalidatePath("/", "layout")
  return { success: true, role: finalRole }
}
