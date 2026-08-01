"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function updateWorkout(
  workoutId: string,
  mode: "strength" | "cardio",
  split: string,
  performedOn: string, // <-- Am adăugat data aici
  sets: any[],
  cardioEntries: any[]
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nu ești autentificat." }

  // 1. Actualizăm antrenamentul părinte (split + data)
  const { error: wError } = await supabase
    .from("workouts")
    .update({ 
      split: mode === "strength" ? split : "CARDIO",
      performed_on: performedOn // <-- Salvăm noua dată
    })
    .eq("id", workoutId)
    .eq("user_id", user.id)

  if (wError) return { error: "Eroare la actualizare: " + wError.message }

  // 2. Ștergem copiii vechi și îi reintroducem pe cei noi (ca până acum)
  await supabase.from("workout_sets").delete().eq("workout_id", workoutId)
  await supabase.from("cardio_sessions").delete().eq("workout_id", workoutId)

  if (mode === "strength" && sets.length > 0) {
    const setsToInsert = sets.map((s, index) => ({
      workout_id: workoutId,
      user_id: user.id,
      split: s.split || split,
      exercise: s.exercise,
      set_number: index + 1,
      reps: s.reps,
      weight: s.weight,
      rir: s.rir,
      set_type: s.set_type || s.setType,
    }))
    await supabase.from("workout_sets").insert(setsToInsert)
  }

  if (mode === "cardio" && cardioEntries.length > 0) {
    const cardioToInsert = cardioEntries.map((c) => ({
      workout_id: workoutId,
      user_id: user.id,
      activity: c.activity,
      duration_min: c.duration_min || c.durationMin,
    }))
    await supabase.from("cardio_sessions").insert(cardioToInsert)
  }

  revalidatePath("/", "layout")
  return { success: true }
}