"use server"

import { getLanguage } from "@/app/language"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function loginUser(formData: FormData) {
  const { t } = await getLanguage()

  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) {
    return { error: t("Te rog să completezi ambele câmpuri.", "Please fill in both fields.") }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: t("Email sau parolă incorectă.", "Incorrect email or password.") }
  }

  // Curățăm cache-ul aplicației pentru a asigura un dashboard proaspăt
  revalidatePath("/", "layout")
  return { success: true }
}