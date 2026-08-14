"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, BarChart3 as ChartIcon, Search, Activity, Footprints, Zap } from "lucide-react"
// Am importat componentele necesare pentru Scatter/Line Chart
import { ComposedChart, BarChart, Bar, Line, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ZAxis } from "recharts"

import { EXERCISES, CARDIO_ACTIVITIES } from "@/lib/workout-data"
import { createClient } from "@/utils/supabase/client"

// Tip pentru modul de vizualizare extins
type ChartMode = "strength" | "cardio" | "steps"

export default function StatsPage() {
  const [loading, setLoading] = useState(true)
  const [workoutData, setWorkoutData] = useState<any[]>([])
  // State nou pentru datele de pași
  const [stepsData, setStepsData] = useState<any[]>([])
  const [userProfile, setUserProfile] = useState<any>(null)

  // Filtre interactive
  const [mode, setMode] = useState<ChartMode>("strength")
  const [selectedExercise, setSelectedExercise] = useState<string>(EXERCISES[0])
  const [selectedCardio, setSelectedCardio] = useState<string>(CARDIO_ACTIVITIES[0])
  const [timeRange, setTimeRange] = useState<number>(30)

  // State pentru dropdown-ul de căutare exerciții
  const [exerciseQuery, setExerciseQuery] = useState("")
  const [isExerciseOpen, setIsExerciseOpen] = useState(false)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - timeRange)
      const cutoffStr = cutoffDate.toISOString().split('T')[0]

      // 1. Preluăm antrenamentele ( existent )
      const workoutsPromise = supabase
        .from("workouts")
        .select(`performed_on, workout_mode, workout_sets (*), cardio_sessions (*)`)
        .eq("user_id", user.id)
        .gte("performed_on", cutoffStr)
        .order("performed_on", { ascending: true })

      // 2. Preluăm pașii zilnici ( NOU )
      const stepsPromise = supabase
        .from("daily_steps")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", cutoffStr)
        .order("date", { ascending: true })

      // 3. Preluăm profilul pentru target ( NOU )
      const profilePromise = supabase
        .from("profiles")
        .select("daily_steps_goal")
        .eq("id", user.id)
        .single()

      // Executăm toate cererile în paralel pentru viteză
      const [workoutsRes, stepsRes, profileRes] = await Promise.all([workoutsPromise, stepsPromise, profilePromise])

      if (workoutsRes.data) setWorkoutData(workoutsRes.data)
      if (stepsRes.data) setStepsData(stepsRes.data)
      if (profileRes.data) setUserProfile(profileRes.data)

      setLoading(false)
    }

    fetchData()
  }, [timeRange]) // Reîncărcăm datele când se schimbă perioada

  // --- PROCESARE DATE PENTRU GRAFIC ---
  const chartData = (() => {
    // Definirea cutoffDate aici pentru utilizare în procesarea pașilor
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - timeRange)

    if (mode === "strength") {
      if (!workoutData.length) return []
      const points: any[] = []
      workoutData.forEach((w) => {
        if (w.workout_mode !== "strength") return
        const workingSets = w.workout_sets?.filter((s: any) => 
          s.exercise === selectedExercise && 
          (s.set_type === "Working Set" || s.setType === "Working Set" || !s.set_type)
        )
        if (workingSets && workingSets.length > 0) {
          const maxWeight = Math.max(...workingSets.map((s: any) => Number(s.weight) || 0))
          const maxReps = Math.max(...workingSets.map((s: any) => Number(s.reps) || 0))
          const dateStr = new Date(w.performed_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          points.push({ date: dateStr, weight: maxWeight, reps: maxReps })
        }
      })
      return points
    } else if (mode === "cardio") {
      if (!workoutData.length) return []
      const points: any[] = []
      workoutData.forEach((w) => {
        if (w.workout_mode !== "cardio") return
        const matchingCardio = w.cardio_sessions?.filter((c: any) => c.activity === selectedCardio)
        if (matchingCardio && matchingCardio.length > 0) {
          const totalDuration = matchingCardio.reduce((acc: number, curr: any) => acc + (curr.duration_min || 0), 0)
          const dateStr = new Date(w.performed_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          points.push({ date: dateStr, duration: totalDuration })
        }
      })
      return points
    } else if (mode === "steps") {
      // PROCESARE NOUĂ PENTRU PAȘI
      if (!stepsData.length) return []
      const defaultGoal = userProfile?.daily_steps_goal || 10000
      
      return stepsData.map(s => {
        const stepsEffectivi = s.steps
        // Folosim target-ul istoric dacă tabelul daily_steps va fi extins să-l stocheze, 
        // momentan folosim target-ul actual din profil.
        const targetZilnic = defaultGoal 
        
        const dateStr = new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        
        return {
          date: dateStr,
          pasi: stepsEffectivi,
          // Target-ul afișat ca linie punctată
          targetLine: targetZilnic,
          // Bulina roșie apare doar dacă target-ul NU a fost atins
          targetScatter: stepsEffectivi < targetZilnic ? targetZilnic : null
        }
      })
    }
    return []
  })()

  // Configurație Tooltip custom pentru pași
  const StepsTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const achieved = data.pasi >= data.targetLine;
      return (
        <div className="backgroundColor: #18181b border border-zinc-700 color: #f4f4f5 rounded-xl padding: 12px 16px shadow-2xl font-bold text-sm flex flex-col gap-1.5">
          <p className="text-zinc-400 font-mono text-xs">{data.date}</p>
          <p style={{ color: "#22d3ee" }}>Pași: {data.pasi.toLocaleString('ro-RO')}</p>
          <p style={{ color: achieved ? "#10b981" : "#fb7185" }}>Target: {data.targetLine.toLocaleString('ro-RO')}</p>
          {achieved ? 
            <p className="text-emerald-400 text-xs mt-1 font-black flex items-center gap-1"><Zap className="size-3" /> OBIECTIV ATINS</p> 
            : 
            <p className="text-rose-400 text-xs mt-1 font-black">-{ (data.targetLine - data.pasi).toLocaleString('ro-RO') } pași ramăși</p>
          }
        </div>
      );
    }
    return null;
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col p-5 bg-zinc-950 text-zinc-100">
      
      {/* HEADER MODERN */}
      <header className="flex items-center gap-3 mb-6 mt-2">
        <Link href="/" className="p-2.5 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-xl transition-all border border-transparent hover:border-zinc-800">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Evoluție & Grafice</h1>
      </header>

      {/* 1. Selector Mod (Strength / Cardio / Steps) - GRID ACTUAlIZAT la 3 coloane */}
      <div className="grid grid-cols-3 gap-1 p-1.5 border border-zinc-800/80 rounded-2xl bg-zinc-900/60 shadow-inner mb-6">
        <button
          onClick={() => setMode("strength")}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
            mode === "strength" 
              ? "bg-zinc-800 text-zinc-100 shadow-md border border-zinc-700/50" 
              : "text-zinc-500 hover:text-zinc-300 border border-transparent"
          }`}
        >
          <ChartIcon className="size-4" /> Forță
        </button>
        <button
          onClick={() => setMode("cardio")}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
            mode === "cardio" 
              ? "bg-zinc-800 text-zinc-100 shadow-md border border-zinc-700/50" 
              : "text-zinc-500 hover:text-zinc-300 border border-transparent"
          }`}
        >
          <Activity className="size-4" /> Cardio
        </button>
        {/* OPȚIUNE NOUĂ PENTRU PAȘI */}
        <button
          onClick={() => setMode("steps")}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
            mode === "steps" 
              ? "bg-zinc-800 text-zinc-100 shadow-md border border-zinc-700/50" 
              : "text-zinc-500 hover:text-zinc-300 border border-transparent"
          }`}
        >
          <Footprints className="size-4" /> Pași
        </button>
      </div>

      <div className="flex flex-col gap-5 p-5 border border-zinc-800/80 rounded-3xl bg-zinc-900/40 shadow-xl backdrop-blur-sm mb-6">
        
        {/* 2. Selector Exercițiu / Activitate - Afișat doar pentru Strength/Cardio */}
        {mode !== "steps" && (
          <div className="flex flex-col gap-1.5 relative">
            <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1">
              {mode === "strength" ? "Exercițiu Urmărit" : "Activitate Cardio"}
            </label>
            
            {mode === "strength" ? (
              <div className="relative">
                <input
                  type="text"
                  value={isExerciseOpen ? exerciseQuery : selectedExercise}
                  onChange={(e) => {
                    setExerciseQuery(e.target.value)
                    setIsExerciseOpen(true)
                  }}
                  onFocus={() => {
                    setExerciseQuery("") 
                    setIsExerciseOpen(true)
                  }}
                  onBlur={() => setTimeout(() => setIsExerciseOpen(false), 150)}
                  placeholder="Caută exercițiul..."
                  className="h-12 w-full pl-4 pr-10 rounded-xl border border-zinc-800 bg-zinc-950 text-cyan-400 font-semibold text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 outline-none transition-all shadow-inner"
                />
                <Search className="absolute right-4 top-3.5 size-4 text-zinc-500 pointer-events-none" />

                {/* LISTA CĂUTARE */}
                {isExerciseOpen && (
                  <ul className="absolute z-[999] top-[52px] left-0 right-0 max-h-60 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-200 p-1.5 shadow-2xl shadow-black">
                    {EXERCISES.filter(ex => ex.toLowerCase().includes(exerciseQuery.toLowerCase())).length > 0 ? (
                      EXERCISES.filter(ex => ex.toLowerCase().includes(exerciseQuery.toLowerCase())).map((ex) => (
                        <li
                          key={ex}
                          onMouseDown={(e) => {
                            e.preventDefault() 
                            setSelectedExercise(ex)
                            setIsExerciseOpen(false)
                          }}
                          className={`cursor-pointer rounded-lg px-3 py-2.5 text-sm transition-all ${
                            selectedExercise === ex 
                              ? 'bg-cyan-500/15 text-cyan-400 font-bold border border-cyan-500/20' 
                              : 'hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 border border-transparent'
                          }`}
                        >
                          {ex}
                        </li>
                      ))
                    ) : (
                      <li className="px-3 py-4 text-sm text-zinc-500 text-center font-medium">Nu am găsit acest exercițiu.</li>
                    )}
                  </ul>
                )}
              </div>
            ) : (
              <select 
                value={selectedCardio} 
                onChange={(e) => setSelectedCardio(e.target.value)}
                className="h-12 px-4 rounded-xl border border-zinc-800 bg-zinc-950 text-rose-400 font-semibold text-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-500/50 outline-none transition-all shadow-inner appearance-none"
              >
                {CARDIO_ACTIVITIES.map((act) => <option key={act} value={act}>{act}</option>)}
              </select>
            )}
          </div>
        )}

        {/* 3. Selector Perioadă Timp */}
        <div className="flex flex-col gap-1.5 mt-1">
          <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1">
            Perioadă Analizată
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "7Z", days: 7 },
              { label: "1L", days: 30 },
              { label: "1A", days: 365 },
              { label: "ALL", days: 7300 },
            ].map((range) => (
              <button
                key={range.days}
                onClick={() => setTimeRange(range.days)}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all border ${
                  timeRange === range.days 
                    ? `bg-zinc-200 text-zinc-950 border-zinc-300 shadow-md` 
                    : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Zona Grafic Premium (BAR/COMPOSED CHART) */}
      <div className="flex-1 flex flex-col border border-zinc-800/80 rounded-3xl bg-zinc-900/40 p-5 shadow-xl backdrop-blur-sm min-h-[350px] justify-center items-center relative overflow-hidden">
        {/* Glow fundal pentru zona de grafic */}
        <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>

        {loading ? (
          <div className="flex flex-col items-center gap-3 opacity-50 relative z-10">
            <div className="size-6 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Analizăm datele...</p>
          </div>
        ) : chartData.length === 0 ? (
          <div className="text-center text-zinc-500 p-6 relative z-10">
            <ChartIcon className="size-12 mx-auto mb-3 opacity-20 text-zinc-400" />
            <p className="text-sm font-medium">Nu am găsit date suficiente pentru a genera un grafic în această perioadă.</p>
          </div>
        ) : (
          <div className="w-full h-[300px] relative z-10">
            <ResponsiveContainer width="100%" height="100%">
              
              {/* LOGICĂ RANDARE GRAFIC: BarChart pt Strength/Cardio, ComposedChart pt Pași */}
              
              {mode === "steps" ? (
                // --- GRAFIC PAȘI (Scatter + Line) ---
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
                  <CartesianGrid stroke="#27272a" strokeDasharray="4 4" vertical={false} />
                  
                  <XAxis 
                    dataKey="date" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={{ stroke: '#3f3f46' }}
                    tick={{ fill: '#71717a' }}
                    dy={10}
                  />
                  
                  <YAxis 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tick={{ fill: '#71717a' }}
                    dx={-5}
                    domain={[0, (dataMax: number) => Math.max(dataMax, (userProfile?.daily_steps_goal || 10000)) + 2000]} // Ne asigurăm că targetul e mereu vizibil
                  />
                  
                  <ZAxis range={[60, 60]} /> {/* Dimensiunea bulinelor Scatter */}

                  {/* Tooltip custom pentru pași */}
                  <Tooltip content={<StepsTooltip />} cursor={{ stroke: '#3f3f46', strokeWidth: 1, strokeDasharray: '6 6' }} />
                  
                  <Legend 
                    wrapperStyle={{ paddingTop: '25px', fontSize: '11px', fontWeight: 'bold', color: '#a1a1aa', fontFamily: 'monospace' }} 
                    iconType="circle"
                  />
                  
                  {/* Linia de target punctată (referință) */}
                  <Line 
                    type="monotone" 
                    dataKey="targetLine" 
                    name="Target Zilnic (Ref)" 
                    stroke="#52525b" // zinc-600
                    strokeWidth={1}
                    strokeDasharray="6 6"
                    dot={false}
                    activeDot={false}
                    legendType="none" // Nu o arătăm în legendă ca linie
                  />

                  {/* Bulina Albastră (Cyan) - Pași Efectuați */}
                  <Scatter 
                    dataKey="pasi" 
                    name="Pași Efectuați" 
                    fill="#22d3ee" // cyan-400
                    stroke="#18181b"
                    strokeWidth={1}
                  />

                  {/* Bulina Roșie (Rose) - Target (doar când nu e atins) */}
                  <Scatter 
                    dataKey="targetScatter" 
                    name="Target Nealiat" 
                    fill="#fb7185" // rose-400
                    stroke="#18181b"
                    strokeWidth={1}
                  />
                </ComposedChart>
              ) : (
                // --- GRAFIC STRENGTH/CARDIO (BarChart - Existent) ---
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid stroke="#27272a" strokeDasharray="4 4" vertical={false} />
                  
                  <XAxis 
                    dataKey="date" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={{ stroke: '#3f3f46' }}
                    tick={{ fill: '#71717a' }}
                    dy={10}
                  />
                  
                  <YAxis 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tick={{ fill: '#71717a' }}
                    dx={-10}
                  />
                  
                  <Tooltip 
                    cursor={{ fill: '#27272a', opacity: 0.4 }}
                    contentStyle={{ 
                      backgroundColor: "#18181b", 
                      borderColor: "#27272a", 
                      color: "#f4f4f5", 
                      borderRadius: "12px", 
                      padding: "10px 14px", 
                      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
                      fontWeight: "bold",
                      fontSize: "13px"
                    }}
                  />
                  
                  <Legend 
                    wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 'bold', color: '#a1a1aa' }} 
                    iconType="circle"
                  />
                  
                  {mode === "strength" ? (
                    <>
                      <Bar dataKey="weight" name="Greutate (kg)" fill="#22d3ee" radius={[4, 4, 0, 0]} animationDuration={1000} />
                      <Bar dataKey="reps" name="Repetări" fill="#10b981" radius={[4, 4, 0, 0]} animationDuration={1000} />
                    </>
                  ) : (
                    <Bar dataKey="duration" name="Durată (min)" fill="#fb7185" radius={[4, 4, 0, 0]} animationDuration={1000} />
                  )}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </main>
  )
}