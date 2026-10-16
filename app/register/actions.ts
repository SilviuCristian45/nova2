"use server"

import { getLanguage } from "@/app/language"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function registerUser(formData: FormData) {
  const { t } = await getLanguage()

  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) {
    return { error: t("Te rog să completezi ambele câmpuri.", "Please fill in both fields.") }
  }

  if (password.length < 6) {
    return { error: t("Parola trebuie să aibă cel puțin 6 caractere.", "Password must contain at least 6 characters.") }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
  })

  if (error) {
    return { error: t("Eroare la înregistrare: ", "Could not register: ") + error.message }
  }

  revalidatePath("/", "layout")
  return { success: true }
}