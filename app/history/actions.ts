"use server"

import { getLanguage } from "@/app/language"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function deleteWorkout(workoutId: string) {
  const { t } = await getLanguage()

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: t("Nu ești autentificat.", "You are not signed in.") }

  // Ștergem din baza de date (RLS și Cascade își fac treaba pe fundal)
  const { error } = await supabase
    .from("workouts")
    .delete()
    .eq("id", workoutId)
    .eq("user_id", user.id)

  if (error) {
    return { error: t("Eroare la ștergere: ", "Could not delete: ") + error.message }
  }

  // Curățăm cache-ul aplicației complet!
  revalidatePath("/", "layout")
  return { success: true }
}