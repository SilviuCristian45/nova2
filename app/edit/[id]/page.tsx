import { Text } from "@/app/components/language-provider"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import EditWorkoutForm from "./edit-form"
import { Message, Screen } from "@/app/components/ui"

export const dynamic = "force-dynamic"
export const revalidate = 0

// În Next.js 15, params vine ca o promisiune, așa că trebuie să-i dăm await
export default async function EditWorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: workout, error } = await supabase
    .from("workouts")
    .select(`*, workout_sets (*), cardio_sessions (*)`)
    .eq("id", id)
    .single()

  if (error || !workout) {
    return <Screen back="/history"><Message><Text ro="Antrenamentul nu a fost găsit." en="Workout not found." /></Message></Screen>
  }

  return <EditWorkoutForm initialWorkout={workout} />
}