"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function deleteWorkout(workoutId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nu ești autentificat." }

  // Ștergem din baza de date (RLS și Cascade își fac treaba pe fundal)
  const { error } = await supabase
    .from("workouts")
    .delete()
    .eq("id", workoutId)
    .eq("user_id", user.id)

  if (error) {
    return { error: "Eroare la ștergere: " + error.message }
  }

  // Curățăm cache-ul aplicației complet!
  revalidatePath("/", "layout")
  return { success: true }
}