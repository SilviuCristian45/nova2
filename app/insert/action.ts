"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function saveWorkout(
  mode: "strength" | "cardio",
  split: string,
  sets: any[],
  cardioEntries: any[]
) {
  const supabase = await createClient()

  // 1. Verificăm autentificarea
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Nu ești autentificat." }

  // 2. Creăm antrenamentul "părinte" în tabela workouts
  const { data: workout, error: workoutError } = await supabase
    .from("workouts")
    .insert({
      user_id: user.id,
      workout_mode: mode,
      split: mode === "strength" ? split : 'CARDIO',
      performed_on: new Date().toISOString(), // sau data curentă de la DB
    })
    .select()
    .single()

  if (workoutError) return { error: "Eroare la crearea antrenamentului: " + workoutError.message }

  // 3. Inserăm "copiii" în funcție de mod
  if (mode === "strength" && sets.length > 0) {
    const setsToInsert = sets.map((s) => ({
      workout_id: workout.id,
      user_id: user.id,
      split: s.split,
      exercise: s.exercise,
      set_number: s.setNumber,
      reps: s.reps,
      weight: s.weight,
      rir: s.rir,
      set_type: s.setType,
    }))

    const { error: setsError } = await supabase.from("workout_sets").insert(setsToInsert)
    if (setsError) return { error: "Eroare la salvarea seturilor: " + setsError.message }
  }

  if (mode === "cardio" && cardioEntries.length > 0) {
    const cardioToInsert = cardioEntries.map((c) => ({
      workout_id: workout.id,
      user_id: user.id,
      activity: c.activity,
      duration_min: c.durationMin,
    }))

    const { error: cardioError } = await supabase.from("cardio_sessions").insert(cardioToInsert)
    if (cardioError) return { error: "Eroare la salvarea cardio: " + cardioError.message }
  }

  // 4. Curățăm cache-ul aplicației ca la întoarcere să avem datele noi
  revalidatePath("/", "layout")
  return { success: true }
}