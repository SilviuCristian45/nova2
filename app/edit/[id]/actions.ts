"use server"

import { getLanguage } from "@/app/language"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { updateWorkoutArgs } from "@/lib/workout-edit"

export async function updateWorkout(
  workoutId: string,
  mode: "strength" | "cardio",
  split: string,
  performedOn: string, // <-- Am adăugat data aici
  sets: any[],
  cardioEntries: any[]
) {
  const { t } = await getLanguage()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: t("Nu ești autentificat.", "You are not signed in.") }

  // One transaction in SQL: a failure leaves the old sets untouched.
  const { error } = await supabase.rpc(
    "update_workout",
    updateWorkoutArgs(workoutId, mode, split, performedOn, sets, cardioEntries),
  )
  if (error) return { error: t("Eroare la actualizare: ", "Could not update: ") + error.message }

  revalidatePath("/", "layout")
  return { success: true }
}