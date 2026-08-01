import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import EditWorkoutForm from "./edit-form"

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
    return <div className="p-5 text-center text-red-500">Antrenamentul nu a fost găsit.</div>
  }

  return <EditWorkoutForm initialWorkout={workout} />
}