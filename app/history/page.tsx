import Link from "next/link"
import { ArrowLeft, Calendar, Dumbbell, Heart, ChevronDown, Flame, Filter, ChevronLeft, ChevronRight } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { DeleteWorkoutButton } from "./delete-button"

export const dynamic = "force-dynamic"
export const revalidate = 0

// --- FUNCȚIA STREAK ---
function calculateWeeklyStreak(workouts: any[]) {
  if (!workouts || workouts.length === 0) return 0;
  const getMondayTime = (dateString: string | Date) => {
    const d = new Date(dateString);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff)).setHours(0, 0, 0, 0);
  };
  const activeWeeks = new Set(workouts.map(w => getMondayTime(w.performed_on)));
  let checkDate = new Date();
  let streak = 0;
  if (activeWeeks.has(getMondayTime(checkDate))) {
    streak++;
  } else {
    checkDate.setDate(checkDate.getDate() - 7);
    if (!activeWeeks.has(getMondayTime(checkDate))) return 0;
  }
  while (true) {
    checkDate.setDate(checkDate.getDate() - 7);
    if (activeWeeks.has(getMondayTime(checkDate))) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

const PAGE_SIZE = 5

export default async function HistoryPage(props: any) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // 1. REZOLVAREA PAGINII GOALE:
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-5 text-center">
        <h1 className="text-2xl font-bold mb-2">Sesiune Expirată</h1>
        <p className="text-muted-foreground mb-6">Trebuie să te loghezi din nou pentru a vedea istoricul.</p>
        <Link href="/login" className="px-6 py-2 bg-primary text-primary-foreground rounded-md font-medium">
          Mergi la Login
        </Link>
      </div>
    )
  }

  // 2. REZOLVARE EROARE NEXT.JS 15 (searchParams asincron):
  const searchParams = await Promise.resolve(props.searchParams || {})

  // 3. LOGICA DE FILTRARE
  // 3. LOGICA DE FILTRARE
  const today = new Date()
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(today.getDate() - 30)

  const startDate = (searchParams.startDate as string) || thirtyDaysAgo.toISOString().split("T")[0]
  const endDate = (searchParams.endDate as string) || today.toISOString().split("T")[0]

  // Folosim constanta PAGE_SIZE de sus
  const currentPage = Number(searchParams.page) || 1
  const from = (currentPage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  // 4. FETCH FLACĂRĂ (toate datele)
  const { data: allDates } = await supabase
    .from("workouts")
    .select("performed_on")
    .eq("user_id", user.id)
  
  const streak = calculateWeeklyStreak(allDates || [])

  // 5. FETCH PAGINAT
  // ATENȚIE: Am pus 'let' în loc de 'const' ca să putem reseta eroarea!
  let { data: workouts, error, count } = await supabase
    .from("workouts")
    .select(`
      *,
      workout_sets (*),
      cardio_sessions (*)
    `, { count: 'exact' })
    .eq("user_id", user.id)
    .gte("performed_on", startDate)
    .lte("performed_on", endDate)
    .order("performed_on", { ascending: false })
    .range(from, to)

  // --- REZOLVAREA ERORII "Requested range not satisfiable" ---
  if (error && (error.code === 'PGRST103' || error.message.includes("range not satisfiable"))) {
    error = null; // Anulăm eroarea
    workouts = []; // Returnăm o listă goală
  }

  if (error) {
    return <div className="p-5 text-red-500 text-center mt-10">Eroare Supabase: {error.message}</div>
  }

  const totalPages = Math.ceil((count || 0) / PAGE_SIZE)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col p-5 bg-background">
      
      {/* HEADER */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 -ml-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-lg transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Istoric</h1>
        </div>
        
        {streak > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 text-orange-600 dark:text-orange-500 rounded-full border border-orange-500/20 shadow-sm">
            <Flame className="size-4 fill-orange-500/20 animate-pulse" />
            <span className="text-sm font-bold">{streak} <span className="hidden sm:inline">săpt.</span></span>
          </div>
        )}
      </header>

      {/* FILTRE (Formular de tip GET fără JS client-side) */}
      <form method="GET" className="flex flex-col gap-3 mb-6 bg-secondary/20 p-4 rounded-xl border border-secondary/50">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
          <Filter className="size-4" /> Filtrează antrenamentele
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">De la</label>
            <input type="date" name="startDate" defaultValue={startDate} className="h-9 px-2 text-sm rounded-md border bg-background" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Până la</label>
            <input type="date" name="endDate" defaultValue={endDate} className="h-9 px-2 text-sm rounded-md border bg-background" />
          </div>
        </div>
        <button type="submit" className="h-9 w-full bg-secondary text-secondary-foreground text-sm font-medium rounded-md hover:bg-secondary/80 transition-colors">
          Aplică Filtrele
        </button>
      </form>

      {/* LISTA DE ANTRENAMENTE */}
      {workouts?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-center border border-dashed rounded-xl border-secondary/60">
          <Dumbbell className="size-10 mb-3 opacity-20" />
          <p className="text-sm">Nu am găsit antrenamente în această perioadă.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {workouts?.map((workout) => {
            const isCardio = workout.workout_mode === "cardio"
            const date = new Date(workout.performed_on).toLocaleDateString("ro-RO", {
              weekday: "short", day: "numeric", month: "short", year: "numeric"
            })

            const groupedSets: Record<string, any[]> = {}
            if (!isCardio && workout.workout_sets) {
              workout.workout_sets.forEach((set: any) => {
                if (!groupedSets[set.exercise]) groupedSets[set.exercise] = []
                groupedSets[set.exercise].push(set)
              })
            }

            return (
              <div key={workout.id} className="flex flex-col border rounded-xl bg-card shadow-sm overflow-hidden">
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
                  <div className="flex items-center gap-2">
                    <Link href={`/edit/${workout.id}`} className="p-2 text-muted-foreground hover:bg-blue-500/10 hover:text-blue-500 rounded-md transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </Link>
                    <DeleteWorkoutButton id={workout.id} />
                  </div>
                </div>

                <div className="p-4 flex flex-col gap-2">
                  {isCardio ? (
                    workout.cardio_sessions?.map((c: any) => (
                      <div key={c.id} className="flex justify-between items-center text-sm">
                        <span className="font-medium">{c.activity}</span>
                        <span className="text-muted-foreground">{c.duration_min} min</span>
                      </div>
                    ))
                  ) : (
                    Object.entries(groupedSets).map(([exerciseName, sets]) => (
                      <details key={exerciseName} className="group [&_summary::-webkit-details-marker]:hidden mb-2 last:mb-0 rounded-xl border border-secondary/60 bg-secondary/10 p-3 shadow-sm transition-all">
                        <summary className="flex cursor-pointer items-center justify-between font-semibold outline-none">
                          <span className="text-sm">{exerciseName}</span>
                          <ChevronDown className="size-4 text-muted-foreground transition-transform duration-300 group-open:rotate-180" />
                        </summary>
                        
                        <div className="mt-3 flex flex-col gap-2 border-t border-secondary/50 pt-3 text-sm">
                          {sets.map((set: any) => (
                            <div key={set.id} className="flex flex-col py-1 border-b last:border-0 border-secondary/50">
                              <div className="flex items-center justify-between">
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
                              {set.notes && (
                                <div className="text-xs text-blue-500/80 italic mt-1 bg-blue-500/10 px-2 py-1 rounded-md w-fit">
                                  📝 {set.notes}
                                </div>
                              )}
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

      {/* CONTROALE PAGINARE */}
      {totalPages > 1 && (
        <div className="mt-8 mb-4 flex items-center justify-between border-t pt-4">
          <Link 
            href={`?page=${Math.max(1, currentPage - 1)}&startDate=${startDate}&endDate=${endDate}`}
            className={`flex items-center gap-1 text-sm font-medium p-2 rounded-md transition-colors ${currentPage <= 1 ? "pointer-events-none opacity-40" : "hover:bg-secondary/50"}`}
          >
            <ChevronLeft className="size-4" /> Înapoi
          </Link>
          
          <span className="text-sm text-muted-foreground">
            Pagina <span className="font-bold text-foreground">{currentPage}</span> din {totalPages}
          </span>
          
          <Link 
            href={`?page=${Math.min(totalPages, currentPage + 1)}&startDate=${startDate}&endDate=${endDate}`}
            className={`flex items-center gap-1 text-sm font-medium p-2 rounded-md transition-colors ${currentPage >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-secondary/50"}`}
          >
            Înainte <ChevronRight className="size-4" />
          </Link>
        </div>
      )}

    </main>
  )
}