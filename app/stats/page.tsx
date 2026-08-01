"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, LineChart as ChartIcon } from "lucide-react"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"

import { EXERCISES, CARDIO_ACTIVITIES } from "@/lib/workout-data"
import { createClient } from "@/utils/supabase/client"

export default function StatsPage() {
  const [loading, setLoading] = useState(true)
  const [rawData, setRawData] = useState<any[]>([])

  // Filtre interactive
  const [mode, setMode] = useState<"strength" | "cardio">("strength")
  const [selectedExercise, setSelectedExercise] = useState<string>(EXERCISES[0])
  const [selectedCardio, setSelectedCardio] = useState<string>(CARDIO_ACTIVITIES[0])
  const [metric, setMetric] = useState<"weight" | "reps">("weight") // Ce măsurăm pentru strength
  const [timeRange, setTimeRange] = useState<number>(30) // 7, 30, 365, 730 zile

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
        
        // FILTRU CRUCIAL: Doar seturile care sunt de lucru ("Working Set")
        const workingSets = w.workout_sets?.filter((s: any) => 
          s.exercise === selectedExercise && 
          (s.set_type === "Working Set" || s.setType === "Working Set" || !s.set_type)
        )
        
        if (workingSets && workingSets.length > 0) {
          let targetValue = 0

          if (metric === "weight") {
            // Greutatea maximă ridicată în seturile de lucru din acel antrenament
            targetValue = Math.max(...workingSets.map((s: any) => Number(s.weight) || 0))
          } else {
            // Repetările maxime sau media efectuată pe seturile de lucru
            targetValue = Math.max(...workingSets.map((s: any) => Number(s.reps) || 0))
          }

          const dateStr = new Date(w.performed_on).toLocaleDateString("ro-RO", { month: "short", day: "numeric" })
          
          points.push({
            date: dateStr,
            value: targetValue,
            label: metric === "weight" ? `${targetValue} kg` : `${targetValue} reps`
          })
        }
      })
      return points
    } else {
      // Cardio rămâne pe durată
      const points: any[] = []
      filteredByTime.forEach((w) => {
        if (w.workout_mode !== "cardio") return
        const matchingCardio = w.cardio_sessions?.filter((c: any) => c.activity === selectedCardio)
        
        if (matchingCardio && matchingCardio.length > 0) {
          const totalDuration = matchingCardio.reduce((acc: number, curr: any) => acc + (curr.duration_min || 0), 0)
          const dateStr = new Date(w.performed_on).toLocaleDateString("ro-RO", { month: "short", day: "numeric" })

          points.push({
            date: dateStr,
            value: totalDuration,
            label: `${totalDuration} min`
          })
        }
      })
      return points
    }
  })()

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col p-5 bg-background">
      <header className="flex items-center gap-3 mb-6">
        <Link href="/" className="p-2 -ml-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-lg transition-colors">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Statistici & Progresie</h1>
      </header>

      {/* 1. Selector Mod (Strength / Cardio) */}
      <div className="grid grid-cols-2 gap-2 p-1 border rounded-lg bg-secondary/30 mb-4">
        <button
          onClick={() => setMode("strength")}
          className={`py-2 rounded-md text-sm font-medium transition-colors ${
            mode === "strength" ? "bg-background border shadow-sm text-foreground" : "text-muted-foreground"
          }`}
        >
          Strength
        </button>
        <button
          onClick={() => setMode("cardio")}
          className={`py-2 rounded-md text-sm font-medium transition-colors ${
            mode === "cardio" ? "bg-background border shadow-sm text-foreground" : "text-muted-foreground"
          }`}
        >
          Cardio
        </button>
      </div>

      {/* 2. Selector Metrică pentru Strength (Greutate vs Repetări) */}
      {mode === "strength" && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={() => setMetric("weight")}
            className={`py-1.5 rounded-md text-xs font-semibold border transition-colors ${
              metric === "weight" ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground hover:bg-secondary"
            }`}
          >
            Progresie Greutate (Kg)
          </button>
          <button
            onClick={() => setMetric("reps")}
            className={`py-1.5 rounded-md text-xs font-semibold border transition-colors ${
              metric === "reps" ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground hover:bg-secondary"
            }`}
          >
            Progresie Repetări (Reps)
          </button>
        </div>
      )}

      {/* 3. Selector Exercițiu / Activitate */}
      <div className="flex flex-col gap-1.5 mb-4">
        <label className="text-xs font-medium text-muted-foreground">
          {mode === "strength" ? "Selectează Exercițiul (Doar Seturi de Lucru)" : "Selectează Activitatea Cardio"}
        </label>
        {mode === "strength" ? (
          <select 
            value={selectedExercise} 
            onChange={(e) => setSelectedExercise(e.target.value)}
            className="h-10 px-3 rounded-md border bg-background text-sm font-medium"
          >
            {EXERCISES.map((ex) => <option key={ex} value={ex}>{ex}</option>)}
          </select>
        ) : (
          <select 
            value={selectedCardio} 
            onChange={(e) => setSelectedCardio(e.target.value)}
            className="h-10 px-3 rounded-md border bg-background text-sm font-medium"
          >
            {CARDIO_ACTIVITIES.map((act) => <option key={act} value={act}>{act}</option>)}
          </select>
        )}
      </div>

      {/* 4. Selector Perioadă Timp */}
      <div className="grid grid-cols-4 gap-1 mb-6 text-xs font-medium">
        {[
          { label: "7 Zile", days: 7 },
          { label: "30 Zile", days: 30 },
          { label: "1 An", days: 365 },
          { label: "2 Ani", days: 730 },
        ].map((range) => (
          <button
            key={range.days}
            onClick={() => setTimeRange(range.days)}
            className={`py-2 rounded-md border transition-colors ${
              timeRange === range.days ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground hover:bg-secondary"
            }`}
          >
            {range.label}
          </button>
        ))}
      </div>

      {/* 5. Zona Grafic */}
      <div className="flex-1 flex flex-col border rounded-2xl bg-card p-4 shadow-sm min-h-[300px] justify-center items-center">
        {loading ? (
          <p className="text-sm text-muted-foreground">Se încarcă datele...</p>
        ) : chartData.length === 0 ? (
          <div className="text-center text-muted-foreground p-6">
            <ChartIcon className="size-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Nu există seturi de lucru înregistrate pentru selecția curentă.</p>
          </div>
        ) : (
          <div className="w-full h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="date" fontSize={12} tickLine={false} />
                <YAxis fontSize={12} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "var(--background)", borderColor: "var(--border)", borderRadius: "8px", fontSize: "12px" }}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="var(--foreground)" 
                  strokeWidth={2} 
                  dot={{ r: 4, fill: "var(--foreground)" }} 
                  activeDot={{ r: 6 }} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </main>
  )
}