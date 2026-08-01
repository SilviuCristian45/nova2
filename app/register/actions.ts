"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function registerUser(formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) {
    return { error: "Te rog să completezi ambele câmpuri." }
  }

  if (password.length < 6) {
    return { error: "Parola trebuie să aibă cel puțin 6 caractere." }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
  })

  if (error) {
    return { error: "Eroare la înregistrare: " + error.message }
  }

  revalidatePath("/", "layout")
  return { success: true }
}