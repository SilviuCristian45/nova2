import { Text } from "@/app/components/language-provider"
import { WorkoutLabel } from "@/app/components/workout-label"
import { getLanguage } from "@/app/language"
import { localDate } from "@/lib/daily-metrics"
import Link from "next/link"
import { ArrowLeft, Calendar, Dumbbell, Heart, ChevronDown, Flame, Filter, ChevronLeft, ChevronRight, Plus, History, LogOut, Sun, Trophy, TrendingUp, Zap} from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { DeleteWorkoutButton } from "./history/delete-button"
import { getDailySteps } from "./steps/steps"
import StepsInput from "./components/steps-input"
import WeightInput from "./components/weight-input"
import { getDailyGoal } from "./profiles/profile"
import GoalSetting from "./components/goal-setting"
import { Utensils } from "lucide-react"

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
  console.log('active weeks', new Array(activeWeeks));   
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
  const { t, locale } = await getLanguage()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-5 text-center bg-background text-foreground">
        <h1 className="text-2xl font-bold mb-2"><Text ro="Sesiune Expirată" en="Session expired" /></h1>
        <p className="text-muted-foreground mb-6"><Text ro="Trebuie să te loghezi din nou pentru a continua." en="Please sign in again to continue." /></p>
        <Link href="/login" className="px-6 py-2.5 bg-emerald-500 text-zinc-950 rounded-xl font-bold hover:bg-emerald-400 transition-all">
          <Text ro="Mergi la Login" en="Go to sign in" />
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

  const todayStr = localDate()
  const todaySteps = await getDailySteps(todayStr)

  // --- NOU: Preluăm target-ul personalizat ---
  const todayGoal = await getDailyGoal()
  
  const isGoalAchieved = todaySteps >= todayGoal
  const progressPercentage = Math.min(100, (todaySteps / todayGoal) * 100)

  // Dacă utilizatorul este pe Dashboard-ul principal (fără filtre/paginare active)
  if (!isHistoryView) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col p-6 lg:px-10 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 justify-between">
        {/* HEADER MODERN */}
        <header className="flex flex-col gap-6 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs uppercase tracking-widest text-emerald-700 dark:text-emerald-400 font-bold">
                {new Date().toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" }).toUpperCase()}
              </span>
              <h1 className="text-3xl font-extrabold tracking-tight mt-0.5"><Text ro="Pregătit de antrenament?" en="Ready to train?" /></h1>
            </div>
            
            <div className="flex items-center gap-2">
              <Link 
                href="/login" 
                className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
                title={t("Deconectare", "Sign out")}
              >
                <LogOut className="size-4" />
              </Link>
            </div>
          </div>

          {/* USER & STATS BADGE */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800/80 backdrop-blur-md shadow-lg">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{user.email}</span>
              <span className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">{totalSessions} <Text ro="sesiuni înregistrate" en="sessions logged" /></span>
            </div>
            
            {streak > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 text-orange-700 dark:text-orange-400 rounded-full border border-orange-500/20 shadow-inner">
                <Flame className="size-4 fill-orange-500/20 animate-pulse text-orange-700 dark:text-orange-500" />
                <span className="text-xs font-extrabold">{streak} <Text ro="săpt." en="wk" /></span>
              </div>
            )}
          </div>
        </header>

        <div className="relative z-10 my-6 grid gap-4 md:grid-cols-2">
          <section aria-labelledby="daily-steps-title" className="rounded-2xl border border-secondary bg-card p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="daily-steps-title" className="text-lg font-bold"><Text ro="Pași" en="Steps" /></h2>
              <Link href="/stats?mode=steps" className="text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400">
                <Text ro="Vezi graficul" en="View chart" />
              </Link>
            </div>
            {/* Input-ul de pași (Component Client) */}
            <StepsInput initialSteps={todaySteps} date={todayStr} />
            
            {/* BARA DE PROGRES MODERNĂ */}
            <div className="mt-3.5 px-1">
              <div className="flex items-center justify-between text-xs font-medium text-zinc-500 mb-1.5 font-mono">
                <span>0</span>
                <span className={isGoalAchieved ? 'text-emerald-700 dark:text-emerald-400 font-bold' : ''}>
                  {todaySteps.toLocaleString(locale)} / {todayGoal.toLocaleString(locale)}
                </span>
              </div>
              <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden border border-zinc-300/50 dark:border-zinc-700/50">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${isGoalAchieved ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-amber-500'}`}
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>
          </section>
          <WeightInput />
        </div>

        {/* MENIU PRINCIPAL - BUTOANE MARI STYLE APP STORE */}
        <div className="my-auto grid grid-cols-1 gap-4 py-6 md:grid-cols-2">
          <Link 
            href="/insert" 
            className="group relative flex items-center justify-between p-5 rounded-2xl bg-emerald-500 text-zinc-950 font-bold shadow-lg shadow-emerald-500/10 hover:bg-emerald-400 active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-xl bg-white/10 dark:bg-zinc-950/10 text-zinc-950">
                <Plus className="size-6 stroke-[3]" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-lg"><Text ro="Adaugă Antrenament" en="Insert Workout" /></span>
                <span className="text-xs font-medium opacity-80"><Text ro="Înregistrează seturile și exercițiile de azi" en="Log today's sets & exercises" /></span>
              </div>
            </div>
            <span className="text-xl font-bold opacity-60 group-hover:translate-x-1 transition-transform">→</span>
          </Link>

        

		  
		  {/* BUTON 2: HISTORY */}
          <Link 
            href="/?history=true" 
            className="group relative flex items-center justify-between p-5 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 active:scale-[0.98] transition-all shadow-xl"
          >
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-xl bg-zinc-200 dark:bg-zinc-800 text-emerald-700 dark:text-emerald-400">
                <History className="size-6" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-lg"><Text ro="Vezi Antrenamentele" en="View Workouts" /></span>
                <span className="text-xs text-zinc-600 dark:text-zinc-400 font-normal"><Text ro="Revizuiește istoricul tău" en="Review your workout history" /></span>
              </div>
            </div>
            <span className="text-xl font-bold text-zinc-500 group-hover:translate-x-1 transition-transform">→</span>
          </Link>

          {/* BUTON 3: PROGRESIE & GRAFICE */}
          <Link 
            href="/stats" 
            className="group relative flex items-center justify-between p-5 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 active:scale-[0.98] transition-all shadow-xl"
          >
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-xl bg-zinc-200 dark:bg-zinc-800 text-cyan-700 dark:text-cyan-400">
                <TrendingUp className="size-6" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-lg"><Text ro="Progresie & Grafice" en="Progress & Charts" /></span>
                <span className="text-xs text-zinc-600 dark:text-zinc-400 font-normal"><Text ro="Urmărește-ți evoluția în timp" en="Track your progress over time" /></span>
              </div>
            </div>
            <span className="text-xl font-bold text-zinc-500 group-hover:translate-x-1 transition-transform">→</span>
          </Link>

          {/* BUTON 4: RECORDURI PERSONALE (TEMA AURIU/TROFEU) */}
          <Link 
            href="/records" 
            className="group relative flex items-center justify-between p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-500 font-semibold hover:bg-amber-500/20 hover:border-amber-500/30 active:scale-[0.98] transition-all shadow-xl mt-2"
          >
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-400">
                <Trophy className="size-6" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-lg"><Text ro="Recorduri Personale" en="Personal Records" /></span>
                <span className="text-xs text-amber-700/70 dark:text-amber-500/70 font-normal"><Text ro="Cele mai bune performanțe absolute" en="Your all-time best performances" /></span>
              </div>
            </div>
            <span className="text-xl font-bold text-amber-700/40 dark:text-amber-500/40 group-hover:translate-x-1 transition-transform">→</span>
          </Link>

          {/* BUTON 5: NUTRIȚIE & MESE */}
          <Link href="/meals" className="group relative flex items-center justify-between p-4 rounded-3xl bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:border-orange-500/50 transition-all shadow-lg backdrop-blur-sm overflow-hidden">
            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl group-hover:bg-orange-500/20 transition-all"></div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-700 dark:text-orange-500 group-hover:scale-110 transition-transform shadow-inner">
                <Utensils className="size-6" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100"><Text ro="Nutriție & Mese" en="Nutrition & Meals" /></span>
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400"><Text ro="Jurnal alimentar și calorii" en="Food diary and calories" /></span>
              </div>
            </div>
            <div className="flex size-8 items-center justify-center rounded-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-500 group-hover:text-orange-700 dark:group-hover:text-orange-400 group-hover:border-orange-500/30 transition-all relative z-10">
              <Plus className="size-4" />
            </div>
          </Link>
        </div>

		{/* Componentul Client pentru setarea obiectivului */}
		<div className="relative z-10">
			<GoalSetting currentGoal={todayGoal} />
		</div>

        {/* FOOTER DISCRET */}
        <footer className="text-center pb-2">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-600 font-mono tracking-wider"><Text ro="REPLOG MONITORIZARE FITNESS" en="REPLOG FITNESS TRACKER" /></p>
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
    return <div className="p-5 text-red-700 dark:text-red-500 text-center mt-10"><Text ro="Eroare Supabase:" en="Database error:" /> {error.message}</div>
  }

  const totalPages = Math.ceil((count || 0) / PAGE_SIZE)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col p-5 lg:px-10 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      
      {/* HEADER DINAMIC ISTORIC */}
      <header className="flex items-center justify-between mb-6 mt-2">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2.5 -ml-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-xl transition-all border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800">
            <ArrowLeft className="size-5" />
          <span className="sr-only"><Text ro="Înapoi" en="Back" /></span></Link>
          <h1 className="text-2xl font-bold tracking-tight"><Text ro="Antrenamentele Tale" en="Your Workouts" /></h1>
        </div>
        
        {streak > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 text-orange-700 dark:text-orange-400 rounded-full border border-orange-500/20 shadow-sm">
            <Flame className="size-4 fill-orange-500/20 animate-pulse text-orange-700 dark:text-orange-500" />
            <span className="text-xs font-bold">{streak} <span className="hidden sm:inline"><Text ro="săpt." en="wk" /></span></span>
          </div>
        )}
      </header>

      {/* FILTRE PREMIUM */}
      <form method="GET" className="flex flex-col gap-3 mb-6 bg-zinc-100 dark:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-lg backdrop-blur-md">
        <input type="hidden" name="history" value="true" />
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1">
          <Filter className="size-3.5 text-emerald-700 dark:text-emerald-400" /> <Text ro="Filtrează perioada" en="Filter by date" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-zinc-500 font-medium"><Text ro="De la" en="From" /></label>
            <input type="date" name="startDate" defaultValue={startDate} className="h-10 px-3 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 focus:border-emerald-500 focus:outline-none" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-zinc-500 font-medium"><Text ro="Până la" en="To" /></label>
            <input type="date" name="endDate" defaultValue={endDate} className="h-10 px-3 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 focus:border-emerald-500 focus:outline-none" />
          </div>
        </div>
        <input type="hidden" name="page" value="1" />
        <button type="submit" className="h-10 w-full bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs font-bold rounded-xl hover:bg-zinc-300 dark:hover:bg-zinc-700 active:scale-[0.98] transition-all border border-zinc-300/50 dark:border-zinc-700/50 mt-1">
          <Text ro="Aplică Filtrele" en="Apply filters" />
        </button>
      </form>

      {/* LISTA DE ANTRENAMENTE STIL CARD PREMIUM */}
      {workouts?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-500 text-center border border-dashed rounded-2xl border-zinc-200 dark:border-zinc-800 bg-zinc-100/20 dark:bg-zinc-900/20">
          <Dumbbell className="size-10 mb-3 opacity-20 text-emerald-700 dark:text-emerald-400" />
          <p className="text-sm font-medium"><Text ro="Nu am găsit antrenamente în această perioadă." en="No workouts found for this period." /></p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {workouts?.map((workout) => {
            const isCardio = workout.workout_mode === "cardio"
            const date = new Date(workout.performed_on).toLocaleDateString(locale, {
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
              <div key={workout.id} className="flex flex-col border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl bg-zinc-100 dark:bg-zinc-900/40 shadow-xl overflow-hidden backdrop-blur-sm">
                
                {/* CARD HEADER */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-100 dark:bg-zinc-900/60">
                  <div className="flex items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-inner">
                      {isCardio ? <Heart className="size-5 text-rose-700 dark:text-rose-500 fill-rose-500/20" /> : <Dumbbell className="size-5 text-emerald-700 dark:text-emerald-400" />}
                    </div>
                    <div>
                      <h2 className="font-extrabold text-lg leading-tight text-zinc-900 dark:text-zinc-100">
                        {isCardio ? t("Sesiune Cardio", "Cardio session") : <WorkoutLabel value={workout.split} />}
                      </h2>
                      <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-600 dark:text-zinc-400 mt-0.5">
                        <Calendar className="size-3 text-zinc-500" />
                        {date}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!isCardio && (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-300/50 dark:border-zinc-700/50">
                        {totalSetsCount} <Text ro="seturi" en="sets" />
                      </span>
                    )}
                    <div className="flex items-center border-l border-zinc-200 dark:border-zinc-800 pl-2 ml-1 gap-1">
                      <Link href={`/edit/${workout.id}`} className="p-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-emerald-700 dark:hover:text-emerald-400 rounded-lg transition-all" title={t("Editează", "Edit")}>
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
                      <div key={c.id} className="flex justify-between items-center text-sm bg-white dark:bg-zinc-950/40 p-3 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50">
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{c.activity}</span>
                        <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1">
                          ⏱ {c.duration_min} min
                        </span>
                      </div>
                    ))
                  ) : (
                    Object.entries(groupedSets).map(([exerciseName, sets]) => (
                      <details key={exerciseName} className="group [&_summary::-webkit-details-marker]:hidden rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-950/40 p-3.5 shadow-sm transition-all open:bg-white dark:open:bg-zinc-950/80">
                        <summary className="flex cursor-pointer items-center justify-between font-bold text-sm outline-none text-zinc-800 dark:text-zinc-200">
                          <span className="tracking-wide">{exerciseName}</span>
                          <ChevronDown className="size-4 text-zinc-500 transition-transform duration-300 group-open:rotate-180" />
                        </summary>
                        
                        <div className="mt-3 flex flex-col gap-2 border-t border-zinc-200/80 dark:border-zinc-800/80 pt-3 text-xs font-mono">
                          {sets.map((set: any) => (
                            <div key={set.id} className="flex flex-col py-1.5 border-b last:border-0 border-zinc-200 dark:border-zinc-900">
                              <div className="flex items-center justify-between">
                                <span className="text-zinc-500 font-sans font-semibold flex items-center gap-2">
                                  #{set.set_number} 
                                  <span className="text-[10px] uppercase tracking-wider font-mono bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 rounded-md border border-zinc-300/50 dark:border-zinc-700/50">
                                    <WorkoutLabel value={set.set_type} />
                                  </span>
                                </span>
                                <span className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                                  {set.weight > 0 ? `${set.weight} kg × ` : ""}{set.reps} <Text ro="repetări" en="reps" />
                                  <span className="font-normal text-zinc-500 ml-1.5 text-xs">
                                    ({set.rir} RIR)
                                  </span>
                                </span>
                              </div>
                              {set.notes && (
                                <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-sans italic mt-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 w-fit">
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
        <div className="mt-8 mb-6 flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 pt-4">
          <Link 
            href={`?history=true&page=${Math.max(1, currentPage - 1)}&startDate=${startDate}&endDate=${endDate}`}
            className={`flex items-center gap-1 text-xs font-bold p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 transition-all ${currentPage <= 1 ? "pointer-events-none opacity-30" : "hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200"}`}
          >
            <ChevronLeft className="size-4" /> <Text ro="Înapoi" en="Back" />
          </Link>
          
          <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400">
            <Text ro="Pagina" en="Page" /> <strong className="text-emerald-700 dark:text-emerald-400">{currentPage}</strong> / {totalPages}
          </span>
          
          <Link 
            href={`?history=true&page=${Math.min(totalPages, currentPage + 1)}&startDate=${startDate}&endDate=${endDate}`}
            className={`flex items-center gap-1 text-xs font-bold p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 transition-all ${currentPage >= totalPages ? "pointer-events-none opacity-30" : "hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200"}`}
          >
            <Text ro="Înainte" en="Next" /> <ChevronRight className="size-4" />
          </Link>
        </div>
      )}

    </main>
  )
}