import Link from "next/link"
import { ArrowLeft, Calendar, Dumbbell, Heart, ChevronDown } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { DeleteWorkoutButton } from "./delete-button"

// Oprim memoria cache definitiv pentru pagina asta
export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null // Ești protejat deja de middleware

  // Fetch la antrenamente + copiile lor (seturi / cardio)
  const { data: workouts, error } = await supabase
    .from("workouts")
    .select(`
      *,
      workout_sets (*),
      cardio_sessions (*)
    `)
    .eq("user_id", user.id)
    .order("performed_on", { ascending: false })

  if (error) {
    return <div className="p-5 text-red-500 text-center">Eroare: {error.message}</div>
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col p-5 bg-background">
      <header className="flex items-center gap-3 mb-8">
        <Link href="/" className="p-2 -ml-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-lg transition-colors">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Istoric Antrenamente</h1>
      </header>

      {workouts?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center">
          <Dumbbell className="size-12 mb-4 opacity-20" />
          <p>Nu ai niciun antrenament salvat încă.</p>
          <Link href="/insert" className="mt-4 text-primary font-medium hover:underline">
            Începe un antrenament acum
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-5 pb-10">
          {workouts?.map((workout) => {
            const isCardio = workout.workout_mode === "cardio"
            const date = new Date(workout.performed_on).toLocaleDateString("ro-RO", {
              weekday: "short", day: "numeric", month: "short", year: "numeric"
            })

			
            const groupedSets: Record<string, any[]> = {}
            if (!isCardio && workout.workout_sets) {
              workout.workout_sets.forEach((set: any) => {
                if (!groupedSets[set.exercise]) {
                  groupedSets[set.exercise] = []
                }
                groupedSets[set.exercise].push(set)
              })
            }

            return (
              <div key={workout.id} className="flex flex-col border rounded-xl bg-card shadow-sm overflow-hidden">
                
                {/* Partea de sus a cardului (Titlu, Dată, Buton Ștergere) */}
                <div className="flex items-center justify-between p-4 border-b bg-secondary/20">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-background border shadow-sm">
                      {isCardio ? <Heart className="size-5 text-red-500" /> : <Dumbbell className="size-5 text-foreground" />}
                    </div>
                    <div>
                      <h2 className="font-bold text-lg leading-tight">
                        {isCardio ? "Sesiune Cardio" : workout.split}
                      </h2>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <Calendar className="size-3" />
                        {date}
                      </div>
                    </div>
                  </div>
                  {/* Butonul de Editare și Ștergere */}
                  <div className="flex items-center gap-2">
                    <Link 
                      href={`/edit/${workout.id}`}
                      className="p-2 text-muted-foreground hover:bg-blue-500/10 hover:text-blue-500 rounded-md transition-colors"
                      title="Editează antrenament"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </Link>
                    <DeleteWorkoutButton id={workout.id} />
                  </div>
                </div>

                {/* Partea de jos a cardului (Detaliile exercițiilor) */}
                <div className="p-4 flex flex-col gap-2">
                  {isCardio ? (
                    // Afișăm detaliile de cardio
                    workout.cardio_sessions?.map((c: any) => (
                      <div key={c.id} className="flex justify-between items-center text-sm">
                        <span className="font-medium">{c.activity}</span>
                        <span className="text-muted-foreground">{c.duration_min} min</span>
                      </div>
                    ))
                  ) : (
                    // --- Afișăm exercițiile grupate cu Acordeon ---
                    Object.entries(groupedSets).map(([exerciseName, sets]) => (
                      <details 
                        key={exerciseName} 
                        className="group [&_summary::-webkit-details-marker]:hidden mb-2 last:mb-0 rounded-xl border border-secondary/60 bg-secondary/10 p-3 shadow-sm transition-all"
                      >
                        <summary className="flex cursor-pointer items-center justify-between font-semibold outline-none">
                          <span className="text-sm">{exerciseName}</span>
                          <ChevronDown className="size-4 text-muted-foreground transition-transform duration-300 group-open:rotate-180" />
                        </summary>
                        
                        <div className="mt-3 flex flex-col gap-2 border-t border-secondary/50 pt-3 text-sm">
                          {sets.map((set: any) => (
                            <div key={set.id} className="flex items-center justify-between">
                              <span className="text-muted-foreground font-medium flex items-center gap-2">
                                Set {set.set_number} 
                                <span className="text-[10px] uppercase tracking-wider bg-secondary px-1.5 py-0.5 rounded-md">
                                  {set.set_type}
                                </span>
                              </span>
                              <span className="font-bold">
                                {set.weight > 0 ? `${set.weight}kg \u00D7 ` : ""}{set.reps} 
                                <span className="font-normal text-muted-foreground ml-1">
                                  (RIR {set.rir})
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    ))
                  )}
                </div>

              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}