import Link from "next/link"
import { ArrowLeft, Calendar, Dumbbell, Heart, ChevronDown, Flame, Filter, ChevronLeft, ChevronRight, Plus, History, LogOut, Sun, Trophy, TrendingUp } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { DeleteWorkoutButton } from "./history/delete-button"

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

const PAGE_SIZE = 5 // Setat pe 5 așa cum ai agreat

export default async function HistoryPage(props: any) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-5 text-center bg-background text-foreground">
        <h1 className="text-2xl font-bold mb-2">Sesiune Expirată</h1>
        <p className="text-muted-foreground mb-6">Trebuie să te loghezi din nou pentru a continua.</p>
        <Link href="/login" className="px-6 py-2.5 bg-emerald-500 text-zinc-950 rounded-xl font-bold hover:bg-emerald-400 transition-all">
          Mergi la Login
        </Link>
      </div>
    )
  }

  const searchParams = await Promise.resolve(props.searchParams || {})

  // Verificăm dacă suntem pe Home simplu sau dacă utilizatorul a accesat tab-ul de Istoric
  // (Dacă vrei să separi Home-ul de Istoric în rute diferite, poți muta partea de listă, 
  // dar acum le ținem unificate fluid sau orientate pe dashboard dacă nu sunt filtre active)
  const isHistoryView = searchParams.history === "true" || searchParams.page || searchParams.startDate

  // 1. FETCH FLACĂRĂ ȘI STATISTICI
  const { data: allWorkouts } = await supabase
    .from("workouts")
    .select("performed_on")
    .eq("user_id", user.id)
  
  const streak = calculateWeeklyStreak(allWorkouts || [])
  const totalSessions = allWorkouts?.length || 0

  // Dacă utilizatorul este pe Dashboard-ul principal (fără filtre/paginare active)
  if (!isHistoryView) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col p-6 bg-zinc-950 text-zinc-100 justify-between">
        {/* HEADER MODERN */}
        <header className="flex flex-col gap-6 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs uppercase tracking-widest text-emerald-400 font-bold">
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }).toUpperCase()}
              </span>
              <h1 className="text-3xl font-extrabold tracking-tight mt-0.5">Ready to train?</h1>
            </div>
            
            <div className="flex items-center gap-2">
              <Link 
                href="/login" 
                className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-all"
                title="Deconectare"
              >
                <LogOut className="size-4" />
              </Link>
            </div>
          </div>

          {/* USER & STATS BADGE */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-md shadow-lg">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-zinc-200">{user.email}</span>
              <span className="text-xs text-zinc-400 mt-0.5">{totalSessions} sesiuni înregistrate</span>
            </div>
            
            {streak > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 text-orange-400 rounded-full border border-orange-500/20 shadow-inner">
                <Flame className="size-4 fill-orange-500/20 animate-pulse text-orange-500" />
                <span className="text-xs font-extrabold">{streak} săpt.</span>
              </div>
            )}
          </div>
        </header>

        {/* MENIU PRINCIPAL - BUTOANE MARI STYLE APP STORE */}
        <div className="flex flex-col gap-4 my-auto py-6">
          <Link 
            href="/insert" 
            className="group relative flex items-center justify-between p-5 rounded-2xl bg-emerald-500 text-zinc-950 font-bold shadow-lg shadow-emerald-500/10 hover:bg-emerald-400 active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-xl bg-zinc-950/10 text-zinc-950">
                <Plus className="size-6 stroke-[3]" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-lg">Insert Workout</span>
                <span className="text-xs font-medium opacity-80">Log today's sets & exercises</span>
              </div>
            </div>
            <span className="text-xl font-bold opacity-60 group-hover:translate-x-1 transition-transform">→</span>
          </Link>

        

		  
		  {/* BUTON 2: HISTORY */}
          <Link 
            href="/?history=true" 
            className="group relative flex items-center justify-between p-5 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-semibold hover:bg-zinc-800/80 hover:border-zinc-700 active:scale-[0.98] transition-all shadow-xl"
          >
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-xl bg-zinc-800 text-emerald-400">
                <History className="size-6" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-lg">View Workouts</span>
                <span className="text-xs text-zinc-400 font-normal">Revizuiește istoricul tău</span>
              </div>
            </div>
            <span className="text-xl font-bold text-zinc-500 group-hover:translate-x-1 transition-transform">→</span>
          </Link>

          {/* BUTON 3: PROGRESIE & GRAFICE */}
          <Link 
            href="/stats" 
            className="group relative flex items-center justify-between p-5 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-semibold hover:bg-zinc-800/80 hover:border-zinc-700 active:scale-[0.98] transition-all shadow-xl"
          >
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-xl bg-zinc-800 text-cyan-400">
                <TrendingUp className="size-6" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-lg">Progresie & Grafice</span>
                <span className="text-xs text-zinc-400 font-normal">Urmărește-ți evoluția în timp</span>
              </div>
            </div>
            <span className="text-xl font-bold text-zinc-500 group-hover:translate-x-1 transition-transform">→</span>
          </Link>

          {/* BUTON 4: RECORDURI PERSONALE (TEMA AURIU/TROFEU) */}
          <Link 
            href="/records" 
            className="group relative flex items-center justify-between p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 font-semibold hover:bg-amber-500/20 hover:border-amber-500/30 active:scale-[0.98] transition-all shadow-xl mt-2"
          >
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                <Trophy className="size-6" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-lg">Recorduri Personale</span>
                <span className="text-xs text-amber-500/70 font-normal">Cele mai bune performanțe absolute</span>
              </div>
            </div>
            <span className="text-xl font-bold text-amber-500/40 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>

		

        {/* FOOTER DISCRET */}
        <footer className="text-center pb-2">
          <p className="text-[11px] text-zinc-600 font-mono tracking-wider">REPLOG FITNESS TRACKER</p>
        </footer>
      </main>
    )
  }

  // --- DACĂ ESTE ACCESAT ISTORICUL (VIEW WORKOUTS) ---
  const today = new Date()
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(today.getDate() - 30)

  const startDate = (searchParams.startDate as string) || thirtyDaysAgo.toISOString().split("T")[0]
  const endDate = (searchParams.endDate as string) || today.toISOString().split("T")[0]

  const currentPage = Number(searchParams.page) || 1
  const from = (currentPage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

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

  if (error && (error.code === 'PGRST103' || error.message.includes("range not satisfiable"))) {
    error = null;
    workouts = [];
  }

  if (error) {
    return <div className="p-5 text-red-500 text-center mt-10">Eroare Supabase: {error.message}</div>
  }

  const totalPages = Math.ceil((count || 0) / PAGE_SIZE)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col p-5 bg-zinc-950 text-zinc-100">
      
      {/* HEADER DINAMIC ISTORIC */}
      <header className="flex items-center justify-between mb-6 mt-2">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2.5 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-xl transition-all border border-transparent hover:border-zinc-800">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Your Workouts</h1>
        </div>
        
        {streak > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 text-orange-400 rounded-full border border-orange-500/20 shadow-sm">
            <Flame className="size-4 fill-orange-500/20 animate-pulse text-orange-500" />
            <span className="text-xs font-bold">{streak} <span className="hidden sm:inline">săpt.</span></span>
          </div>
        )}
      </header>

      {/* FILTRE PREMIUM */}
      <form method="GET" className="flex flex-col gap-3 mb-6 bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800/80 shadow-lg backdrop-blur-md">
        <input type="hidden" name="history" value="true" />
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">
          <Filter className="size-3.5 text-emerald-400" /> Filtrează perioada
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-zinc-500 font-medium">De la</label>
            <input type="date" name="startDate" defaultValue={startDate} className="h-10 px-3 text-xs rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-200 focus:border-emerald-500 focus:outline-none" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-zinc-500 font-medium">Până la</label>
            <input type="date" name="endDate" defaultValue={endDate} className="h-10 px-3 text-xs rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-200 focus:border-emerald-500 focus:outline-none" />
          </div>
        </div>
        <input type="hidden" name="page" value="1" />
        <button type="submit" className="h-10 w-full bg-zinc-800 text-zinc-100 text-xs font-bold rounded-xl hover:bg-zinc-700 active:scale-[0.98] transition-all border border-zinc-700/50 mt-1">
          Aplică Filtrele
        </button>
      </form>

      {/* LISTA DE ANTRENAMENTE STIL CARD PREMIUM */}
      {workouts?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-500 text-center border border-dashed rounded-2xl border-zinc-800 bg-zinc-900/20">
          <Dumbbell className="size-10 mb-3 opacity-20 text-emerald-400" />
          <p className="text-sm font-medium">Nu am găsit antrenamente în această perioadă.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {workouts?.map((workout) => {
            const isCardio = workout.workout_mode === "cardio"
            const date = new Date(workout.performed_on).toLocaleDateString("en-US", {
              weekday: "short", month: "short", day: "numeric", year: "numeric"
            }).toUpperCase()

            const groupedSets: Record<string, any[]> = {}
            if (!isCardio && workout.workout_sets) {
              workout.workout_sets.forEach((set: any) => {
                if (!groupedSets[set.exercise]) groupedSets[set.exercise] = []
                groupedSets[set.exercise].push(set)
              })
            }

            const totalSetsCount = workout.workout_sets?.length || 0

            return (
              <div key={workout.id} className="flex flex-col border border-zinc-800/80 rounded-2xl bg-zinc-900/40 shadow-xl overflow-hidden backdrop-blur-sm">
                
                {/* CARD HEADER */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800/60 bg-zinc-900/60">
                  <div className="flex items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-zinc-950 border border-zinc-800 shadow-inner">
                      {isCardio ? <Heart className="size-5 text-rose-500 fill-rose-500/20" /> : <Dumbbell className="size-5 text-emerald-400" />}
                    </div>
                    <div>
                      <h2 className="font-extrabold text-lg leading-tight text-zinc-100">
                        {isCardio ? "Cardio Session" : workout.split}
                      </h2>
                      <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 mt-0.5">
                        <Calendar className="size-3 text-zinc-500" />
                        {date}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!isCardio && (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700/50">
                        {totalSetsCount} sets
                      </span>
                    )}
                    <div className="flex items-center border-l border-zinc-800 pl-2 ml-1 gap-1">
                      <Link href={`/edit/${workout.id}`} className="p-2 text-zinc-400 hover:bg-zinc-800 hover:text-emerald-400 rounded-lg transition-all" title="Editează">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                      </Link>
                      <DeleteWorkoutButton id={workout.id} />
                    </div>
                  </div>
                </div>

                {/* CARD BODY */}
                <div className="p-4 flex flex-col gap-3">
                  {isCardio ? (
                    workout.cardio_sessions?.map((c: any) => (
                      <div key={c.id} className="flex justify-between items-center text-sm bg-zinc-950/40 p-3 rounded-xl border border-zinc-800/50">
                        <span className="font-semibold text-zinc-200">{c.activity}</span>
                        <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1">
                          ⏱ {c.duration_min} min
                        </span>
                      </div>
                    ))
                  ) : (
                    Object.entries(groupedSets).map(([exerciseName, sets]) => (
                      <details key={exerciseName} className="group [&_summary::-webkit-details-marker]:hidden rounded-xl border border-zinc-800/60 bg-zinc-950/40 p-3.5 shadow-sm transition-all open:bg-zinc-950/80">
                        <summary className="flex cursor-pointer items-center justify-between font-bold text-sm outline-none text-zinc-200">
                          <span className="tracking-wide">{exerciseName}</span>
                          <ChevronDown className="size-4 text-zinc-500 transition-transform duration-300 group-open:rotate-180" />
                        </summary>
                        
                        <div className="mt-3 flex flex-col gap-2 border-t border-zinc-800/80 pt-3 text-xs font-mono">
                          {sets.map((set: any) => (
                            <div key={set.id} className="flex flex-col py-1.5 border-b last:border-0 border-zinc-900">
                              <div className="flex items-center justify-between">
                                <span className="text-zinc-500 font-sans font-semibold flex items-center gap-2">
                                  #{set.set_number} 
                                  <span className="text-[10px] uppercase tracking-wider font-mono bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-md border border-zinc-700/50">
                                    {set.set_type}
                                  </span>
                                </span>
                                <span className="font-bold text-zinc-100 text-sm">
                                  {set.weight > 0 ? `${set.weight} kg × ` : ""}{set.reps} reps
                                  <span className="font-normal text-zinc-500 ml-1.5 text-xs">
                                    ({set.rir} RIR)
                                  </span>
                                </span>
                              </div>
                              {set.notes && (
                                <div className="text-[11px] text-emerald-400 font-sans italic mt-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 w-fit">
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
        <div className="mt-8 mb-6 flex items-center justify-between border-t border-zinc-800 pt-4">
          <Link 
            href={`?history=true&page=${Math.max(1, currentPage - 1)}&startDate=${startDate}&endDate=${endDate}`}
            className={`flex items-center gap-1 text-xs font-bold p-2.5 rounded-xl border border-zinc-800 bg-zinc-900 transition-all ${currentPage <= 1 ? "pointer-events-none opacity-30" : "hover:bg-zinc-800 text-zinc-200"}`}
          >
            <ChevronLeft className="size-4" /> Înapoi
          </Link>
          
          <span className="text-xs font-mono text-zinc-400">
            Pagina <strong className="text-emerald-400">{currentPage}</strong> / {totalPages}
          </span>
          
          <Link 
            href={`?history=true&page=${Math.min(totalPages, currentPage + 1)}&startDate=${startDate}&endDate=${endDate}`}
            className={`flex items-center gap-1 text-xs font-bold p-2.5 rounded-xl border border-zinc-800 bg-zinc-900 transition-all ${currentPage >= totalPages ? "pointer-events-none opacity-30" : "hover:bg-zinc-800 text-zinc-200"}`}
          >
            Înainte <ChevronRight className="size-4" />
          </Link>
        </div>
      )}

    </main>
  )
}