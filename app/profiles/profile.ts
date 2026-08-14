// app/actions/profile.ts
"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// Preia targetul zilnic al utilizatorului
export async function getDailyGoal() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 10000 // Implicit dacă ceva nu merge

  const { data } = await supabase
    .from("profiles")
    .select("daily_steps_goal")
    .eq("id", user.id)
    .single()

  return data?.daily_steps_goal || 10000
}

// Actualizează targetul zilnic
export async function updateDailyGoal(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Neautorizat" }

  const goalStr = formData.get("dailyGoal") as string
  const goal = parseInt(goalStr, 10)

  if (isNaN(goal) || goal <= 0) {
    return { error: "Targetul trebuie să fie un număr pozitiv" }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ daily_steps_goal: goal })
    .eq("id", user.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/") // Reîmprospătăm Dashboard-ul
  return { success: true }
}