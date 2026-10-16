// app/actions/steps.ts
"use server"

import { getLanguage } from "@/app/language"
import { localDate } from "@/lib/daily-metrics"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// Preia pașii pentru o zi specifică (implicit azi)
export async function getDailySteps(dateStr?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const targetDate = dateStr || localDate()

  const { data } = await supabase
    .from("daily_steps")
    .select("steps")
    .eq("user_id", user.id)
    .eq("date", targetDate)
    .single()

  return data?.steps || 0
}

// Salvează sau actualizează pașii pentru o zi
export async function saveDailySteps(formData: FormData) {
  const { t } = await getLanguage()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: t("Neautorizat", "Not signed in") }

  const date = formData.get("date") as string
  const steps = parseInt(formData.get("steps") as string, 10)

  if (isNaN(steps) || steps < 0) {
    return { error: t("Număr de pași invalid", "Invalid step count") }
  }

  // Folosim upsert pentru a insera sau actualiza pe baza constrângerii UNIQUE (user_id, date)
  const { error } = await supabase
    .from("daily_steps")
    .upsert({ 
      user_id: user.id, 
      date, 
      steps 
    }, { onConflict: 'user_id, date' })

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/") // Reîmprospătăm Dashboard-ul
  revalidatePath("/stats")
  return { success: true }
}