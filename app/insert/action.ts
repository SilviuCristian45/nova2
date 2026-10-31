"use server"

import { getLanguage } from "@/app/language"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { isValidWorkoutDate, saveWorkoutArgs, type SaveCardio, type SaveSet } from "@/lib/workout-save"

export async function saveWorkout(
  mode: "strength" | "cardio",
  split: string,
  date: string, // the client's local date (see localDate()), not the server's UTC day
  sets: SaveSet[],
  cardioEntries: SaveCardio[]
) {
  const { t } = await getLanguage()

  if (!isValidWorkoutDate(date, new Date().toISOString().slice(0, 10))) {
    return { error: t("Data antrenamentului nu este validă.", "The workout date is not valid.") }
  }

  const supabase = await createClient()

  // 1. Verificăm autentificarea
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: t("Nu ești autentificat.", "You are not signed in.") }

  // 2. Antrenamentul și copiii lui se creează într-o singură tranzacție SQL: un eșec nu lasă un antrenament gol
  const { error } = await supabase.rpc("save_workout", saveWorkoutArgs(mode, split, date, sets, cardioEntries))
  if (error) return { error: t("Eroare la salvarea antrenamentului: ", "Could not save the workout: ") + error.message }

  // 3. Curățăm cache-ul aplicației ca la întoarcere să avem datele noi
  revalidatePath("/", "layout")
  return { success: true }
}
