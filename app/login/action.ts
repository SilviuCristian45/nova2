"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function loginUser(formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) {
    return { error: "Te rog să completezi ambele câmpuri." }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: "Email sau parolă incorectă." }
  }

  // Curățăm cache-ul aplicației pentru a asigura un dashboard proaspăt
  revalidatePath("/", "layout")
  return { success: true }
}