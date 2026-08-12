"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, BarChart3 as ChartIcon, Search, Activity } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts"

import { EXERCISES, CARDIO_ACTIVITIES } from "@/lib/workout-data"
import { createClient } from "@/utils/supabase/client"

export default function StatsPage() {
  const [loading, setLoading] = useState(true)
  const [rawData, setRawData] = useState<any[]>([])

  // Filtre interactive
  const [mode, setMode] = useState<"strength" | "cardio">("strength")
  const [selectedExercise, setSelectedExercise] = useState<string>(EXERCISES[0])
  const [selectedCardio, setSelectedCardio] = useState<string>(CARDIO_ACTIVITIES[0])
  const [timeRange, setTimeRange] = useState<number>(30)

  // State pentru dropdown-ul de căutare exerciții
  const [exerciseQuery, setExerciseQuery] = useState("")
  const [isExerciseOpen, setIsExerciseOpen] = useState(false)

  useEffect(() => {
    async function fetchStats() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from("workouts")
        .select(`
          performed_on,
          workout_mode,
          workout_sets (*),
          cardio_sessions (*)
        `)
        .eq("user_id", user.id)
        .order("performed_on", { ascending: true })

      if (!error && data) {
        setRawData(data)
      }
      setLoading(false)
    }

    fetchStats()
  }, [])

  // --- PROCESARE DATE PENTRU GRAFIC ---
  const chartData = (() => {
    if (!rawData.length) return []

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - timeRange)

    const filteredByTime = rawData.filter((w) => {
      const workoutDate = new Date(w.performed_on)
      return workoutDate >= cutoffDate
    })

    if (mode === "strength") {
      const points: any[] = []
      
      filteredByTime.forEach((w) => {
        if (w.workout_mode !== "strength") return
        
        // Doar seturile de lucru ("Working Set")
        const workingSets = w.workout_sets?.filter((s: any) => 
          s.exercise === selectedExercise && 
          (s.set_type === "Working Set" || s.setType === "Working Set" || !s.set_type)
        )
        
        if (workingSets && workingSets.length > 0) {
          // Extragem ATÂT greutatea maximă CÂT ȘI repetările maxime
          const maxWeight = Math.max(...workingSets.map((s: any) => Number(s.weight) || 0))
          const maxReps = Math.max(...workingSets.map((s: any) => Number(s.reps) || 0))
          
          const dateStr = new Date(w.performed_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          
          points.push({
            date: dateStr,
            weight: maxWeight,
            reps: maxReps
          })
        }
      })
      return points
    } else {
      const points: any[] = []
      filteredByTime.forEach((w) => {
        if (w.workout_mode !== "cardio") return
        const matchingCardio = w.cardio_sessions?.filter((c: any) => c.activity === selectedCardio)
        
        if (matchingCardio && matchingCardio.length > 0) {
          const totalDuration = matchingCardio.reduce((acc: number, curr: any) => acc + (curr.duration_min || 0), 0)
          const dateStr = new Date(w.performed_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })

          points.push({
            date: dateStr,
            duration: totalDuration
          })
        }
      })
      return points
    }
  })()

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col p-5 bg-zinc-950 text-zinc-100">
      
      {/* HEADER MODERN */}
      <header className="flex items-center gap-3 mb-6 mt-2">
        <Link href="/" className="p-2.5 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-xl transition-all border border-transparent hover:border-zinc-800">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Evoluție & Grafice</h1>
      </header>

      {/* 1. Selector Mod (Strength / Cardio) */}
      <div className="grid grid-cols-2 gap-1 p-1.5 border border-zinc-800/80 rounded-2xl bg-zinc-900/60 shadow-inner mb-6">
        <button
          onClick={() => setMode("strength")}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
            mode === "strength" 
              ? "bg-zinc-800 text-zinc-100 shadow-md border border-zinc-700/50" 
              : "text-zinc-500 hover:text-zinc-300 border border-transparent"
          }`}
        >
          <ChartIcon className="size-4" /> Strength
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
      </div>

      <div className="flex flex-col gap-5 p-5 border border-zinc-800/80 rounded-3xl bg-zinc-900/40 shadow-xl backdrop-blur-sm mb-6">
        
        {/* 2. Selector Exercițiu / Activitate */}
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

      {/* 4. Zona Grafic Premium (BAR CHART) */}
      <div className="flex-1 flex flex-col border border-zinc-800/80 rounded-3xl bg-zinc-900/40 p-5 shadow-xl backdrop-blur-sm min-h-[350px] justify-center items-center">
        {loading ? (
          <div className="flex flex-col items-center gap-3 opacity-50">
            <div className="size-6 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Analizăm datele...</p>
          </div>
        ) : chartData.length === 0 ? (
          <div className="text-center text-zinc-500 p-6">
            <ChartIcon className="size-12 mx-auto mb-3 opacity-20 text-zinc-400" />
            <p className="text-sm font-medium">Nu am găsit date suficiente pentru a genera un grafic în această perioadă.</p>
          </div>
        ) : (
          <div className="w-full h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              {/* Am schimbat LineChart în BarChart */}
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
                
                {/* Tooltip modificat pentru a arăta bine cu bare multiple */}
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
                
                {/* Legenda care explică culorile */}
                <Legend 
                  wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 'bold', color: '#a1a1aa' }} 
                  iconType="circle"
                />
                
                {/* Randarea dinamică a barelor */}

			

                {mode === "strength" ? (
                  <>
                    {/* Bara de greutate (Cyan) */}
                    <Bar 
                      dataKey="weight" 
                      name="Greutate (kg)" 
                      fill="#22d3ee" 
                      radius={[4, 4, 0, 0]} // Colțuri de sus rotunjite
                      animationDuration={1000}
                    />
                    {/* Bara de repetări (Emerald) */}
                    <Bar 
                      dataKey="reps" 
                      name="Repetări" 
                      fill="#10b981" 
                      radius={[4, 4, 0, 0]} 
                      animationDuration={1000}
                    />
                  </>
                ) : (
                  /* Bara de Cardio (Rose) */
                  <Bar 
                    dataKey="duration" 
                    name="Durată (min)" 
                    fill="#fb7185" 
                    radius={[4, 4, 0, 0]} 
                    animationDuration={1000}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </main>
  )
}