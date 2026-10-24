"use server"

import { getLanguage } from "@/app/language"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { rememberWeightUnit } from "@/app/units"
import { parseWeightUnit } from "@/lib/units"

export async function loginUser(formData: FormData) {
  const { t } = await getLanguage()

  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) {
    return { error: t("Te rog să completezi ambele câmpuri.", "Please fill in both fields.") }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: t("Email sau parolă incorectă.", "Incorrect email or password.") }
  }

  // Unitatea de greutate a contului (cookie-ul poate fi rămas de la alt cont de pe același dispozitiv)
  const { data: profile } = await supabase.from("profiles").select("weight_unit").eq("id", data.user.id).maybeSingle()
  await rememberWeightUnit(parseWeightUnit(profile?.weight_unit))

  // Curățăm cache-ul aplicației pentru a asigura un dashboard proaspăt
  revalidatePath("/", "layout")
  return { success: true }
}