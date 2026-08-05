"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Dumbbell, Heart, Loader2, Save, Trash2, Search } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import confetti from "canvas-confetti"

import { saveWorkout } from "./action"
import { EXERCISES, SPLITS, SET_TYPES, CARDIO_ACTIVITIES, type Split, type SetType, getExercisesForSplit } from "@/lib/workout-data"

const DRAFT_KEY = "workout_draft_v1"

// --- FUNCȚIE PENTRU ETICHETE COLORATE ---
const getSetTypeBadge = (type: string) => {
  const t = type?.toLowerCase() || ""
  if (t.includes("warm") || t.includes("încălzire")) return <span className="bg-blue-500/15 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">Warmup</span>
  if (t.includes("feeder")) return <span className="bg-yellow-500/15 text-yellow-600 dark:text-yellow-500 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">Feeder</span>
  if (t.includes("work")) return <span className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-500 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">Working</span>
  if (t.includes("top")) return <span className="bg-purple-500/15 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">Top Set</span>
  if (t.includes("back") || t.includes("backoff")) return <span className="bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">Backoff</span>
  if (t.includes("drop") || t.includes("fail")) return <span className="bg-red-500/15 text-red-600 dark:text-red-500 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">{type}</span>
  
  // Default (dacă adaugi alte tipuri de seturi în viitor)
  return <span className="bg-secondary text-secondary-foreground px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">{type}</span>
}

export default function InsertWorkoutPage() {
  const router = useRouter()
  const [isSaving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<string>("")

  // State general
  const [mode, setMode] = useState<"strength" | "cardio">("strength")
  const [sessionSets, setSessionSets] = useState<any[]>([])
  const [cardioEntries, setCardioEntries] = useState<any[]>([])

  // Formular Strength
  const [split, setSplit] = useState<Split>("Push")
  // NOU: Lista de exerciții care se schimbă dinamic
  const [availableExercises, setAvailableExercises] = useState<string[]>(getExercisesForSplit("Push"))
  const [exercise, setExercise] = useState(availableExercises[0])
  const [setNumber, setSetNumber] = useState(1)
  const [reps, setReps] = useState("")
  const [weight, setWeight] = useState("")
  const [rir, setRir] = useState("")
  const [setType, setSetType] = useState<SetType>("Working Set")

  // --- NOU: State pentru căutarea exercițiilor ---
  const [exerciseQuery, setExerciseQuery] = useState("")
  const [isExerciseOpen, setIsExerciseOpen] = useState(false)

  // State pentru "Ultima Oară"
  const [lastPerformance, setLastPerformance] = useState<string | null>(null)
  
  // Formular Cardio
  const [cardioActivity, setCardioActivity] = useState(CARDIO_ACTIVITIES[0])
  const [cardioDuration, setCardioDuration] = useState("")
  
  // --- LOGICĂ NOUĂ: Când se schimbă SPLIT-ul, resetăm exercițiile ---
  useEffect(() => {
    const newExercises = getExercisesForSplit(split)
    setAvailableExercises(newExercises)
    setExercise(newExercises[0]) // Auto-selectează primul exercițiu din noul split
    setExerciseQuery("") // Golește textul căutat dacă exista
  }, [split])

  // Obiectul care ține minte recordul setului
  const [bestPerformance, setBestPerformance] = useState<{
    weight: number;
    reps: number;
    rir: number;
    notes?: string;
  } | null>(null)

  // --- FETCH ULTIMA PERFORMANȚĂ ---
  useEffect(() => {
    if (mode !== "strength" || !exercise) return

    async function fetchLastPerformance() {
      setLastPerformance("Se caută în istoric...")
      const supabase = createClient()
      
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Tragem ultimele 10 seturi pentru exercițiul selectat
      const { data, error } = await supabase
        .from("workout_sets")
        .select("weight, reps, rir, created_at, set_type, notes")
        .eq("user_id", user.id)
        .eq("exercise", exercise)
        .order("created_at", { ascending: false })
        .order("weight", { ascending: false })
        .order("reps", { ascending: false })
        .limit(10)

      if (error || !data || data.length === 0) {
        setLastPerformance("Exercițiu nou. Setează primul record!")
        setBestPerformance(null)
        return
      }

      // 1. Găsim data celui mai recent antrenament din aceste seturi
      const mostRecentDate = data[0].created_at.split('T')[0]
      
      // 2. Filtrăm doar seturile din acea zi
      const setsFromLastSession = data.filter(s => s.created_at.split('T')[0] === mostRecentDate)
      
      // 3. Găsim setul cu cea mai mare greutate din ziua respectivă
      const bestSet = setsFromLastSession.reduce((prev, current) => {
        const prevWeight = Number(prev.weight);
        const currentWeight = Number(current.weight);
        if (prevWeight > currentWeight || 
          (prevWeight === currentWeight && Number(prev.reps) > Number(current.reps)) )
          return prev; 
        return current;
      })

      const weightText = bestSet.weight > 0 ? `${bestSet.weight}kg x ` : ""
      const notesText = bestSet.notes ? ` 📝 (${bestSet.notes})` : "" 

      // Salvăm totul grupat și curat în noul state
      setBestPerformance({
        weight: Number(bestSet.weight),
        reps: Number(bestSet.reps),
        rir: Number(bestSet.rir),
        notes: bestSet.notes
      })
      
      setLastPerformance(`💡 Ultima oară: ${weightText}${bestSet.reps} reps (RIR ${bestSet.rir})${notesText}`)
    }

    fetchLastPerformance()
  }, [exercise, mode])

  // --- LOGICA DE CIORNĂ (LOCAL STORAGE) ---
  useEffect(() => {
    const draft = localStorage.getItem(DRAFT_KEY)
    if (draft) {
      try {
        const parsed = JSON.parse(draft)
        if (parsed.length > 0) {
          setSessionSets(parsed)
          setSetNumber(parsed.length + 1)
        }
      } catch (e) {
        console.error("Eroare la citirea ciornei:", e)
      }
    }
  }, [])

  useEffect(() => {
    if (sessionSets.length > 0) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(sessionSets))
    } else {
      localStorage.removeItem(DRAFT_KEY)
    }
  }, [sessionSets])

  // --- HANDLERE FORMULARE ---
  function handleAddSet(e: React.FormEvent) {
    e.preventDefault()
    if (!exercise || reps === "") return

    const newSet = {
      id: Math.random().toString(36).substring(2, 9),
      split,
      exercise,
      setNumber,
      reps: Number(reps),
      weight: weight === "" ? 0 : Number(weight),
      rir: rir === "" ? 0 : Number(rir),
      setType,
      notes: notes.trim(),
    }

    // --- MAGIA PR-ULUI AURIU ---
    let isPersonalRecord = false;

    if (bestPerformance) {
      if (newSet.weight > bestPerformance.weight) {
        isPersonalRecord = true;
      } else if (newSet.weight === bestPerformance.weight && newSet.reps > bestPerformance.reps) {
        isPersonalRecord = true;
      }
    }

    if (isPersonalRecord) {
      confetti({
        particleCount: 40,
        spread: 70,
        origin: { y: 0.65 },
        colors: ['#fbbf24', '#f59e0b', '#d97706'], 
        zIndex: 100, 
      }) 
      
      setBestPerformance({
        weight: newSet.weight,
        reps: newSet.reps,
        rir: newSet.rir,
        notes: newSet.notes
      });

      const weightText = newSet.weight > 0 ? `${newSet.weight}kg x ` : ""
      const notesText = newSet.notes ? ` 📝 (${newSet.notes})` : ""
      
      setLastPerformance(`🏆 Nou Record: ${weightText}${newSet.reps} reps (RIR ${newSet.rir})${notesText}`)
    }

    setSessionSets((prev) => [...prev, newSet])
    setSetNumber((n) => n + 1)
    setReps("") 
    setRir("")
    setNotes("")
  }

  function handleAddCardio(e: React.FormEvent) {
    e.preventDefault()
    if (!cardioActivity || cardioDuration === "") return

    const newEntry = {
      id: Math.random().toString(36).substring(2, 9),
      activity: cardioActivity,
      durationMin: Number(cardioDuration),
    }

    setCardioEntries((prev) => [...prev, newEntry])
    setCardioDuration("")
  }

  function handleFinish() {
    if (mode === "strength" && sessionSets.length === 0) return
    if (mode === "cardio" && cardioEntries.length === 0) return

    setError(null)
    startSaving(async () => {
      const result = await saveWorkout(mode, split, sessionSets, cardioEntries)
      
      if (result.error) {
        setError(result.error)
        return
      }

      localStorage.removeItem(DRAFT_KEY)

      const duration = 2000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 5,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#22c55e', '#eab308', '#3b82f6']
        });
        confetti({
          particleCount: 5,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#22c55e', '#eab308', '#3b82f6']
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      
      frame(); 

      setTimeout(() => {
        router.push("/")
      }, 1500)
    })
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col p-5 bg-background">
      <header className="flex flex-col gap-4 mb-6">
        <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-2 w-fit">
          <ArrowLeft className="size-4" /> Înapoi
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Antrenament Nou</h1>
        
        {/* Toggle Mode */}
        <div className="grid grid-cols-2 gap-2 p-1 border rounded-lg bg-secondary/30">
          <button
            onClick={() => setMode("strength")}
            className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === "strength" ? "bg-background border shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Dumbbell className="size-4" /> Strength
          </button>
          <button
            onClick={() => setMode("cardio")}
            className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === "cardio" ? "bg-background border shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Heart className="size-4" /> Cardio
          </button>
        </div>
      </header>

      {/* --- FORMULAR STRENGTH --- */}
      {mode === "strength" && (
        <form onSubmit={handleAddSet} className="flex flex-col gap-4 p-5 border rounded-xl bg-card shadow-sm mb-6">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Split</label>
            <select value={split} onChange={(e) => setSplit(e.target.value as Split)} className="h-10 px-3 rounded-md border bg-background text-sm">
              {SPLITS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 relative">
            <label className="text-sm font-medium">Exercițiu / Aparat</label>
            
            {/* SEARCHABLE DROPDOWN */}
            <div className="relative">
              <input
                type="text"
                value={isExerciseOpen ? exerciseQuery : exercise}
                onChange={(e) => {
                  setExerciseQuery(e.target.value)
                  setIsExerciseOpen(true)
                }}
                onFocus={() => {
                  setExerciseQuery("") 
                  setIsExerciseOpen(true)
                }}
                onBlur={() => {
                  setTimeout(() => setIsExerciseOpen(false), 150)
                }}
                placeholder="Caută exercițiul..."
                className="h-10 w-full pl-3 pr-10 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow shadow-sm"
              />
              <Search className="absolute right-3 top-3 size-4 text-muted-foreground pointer-events-none" />
            </div>

            {/* LISTA DE EXERCIȚII FILTRATĂ */}
            {isExerciseOpen && (
              <ul className="absolute z-[999] top-[70px] left-0 right-0 max-h-56 overflow-y-auto rounded-md border bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 p-1.5 shadow-2xl">
                {availableExercises.filter(ex => ex.toLowerCase().includes(exerciseQuery.toLowerCase())).length > 0 ? (
                  availableExercises.filter(ex => ex.toLowerCase().includes(exerciseQuery.toLowerCase())).map((ex) => (
                    <li
                      key={ex}
                      onMouseDown={(e) => {
                        e.preventDefault() 
                        setExercise(ex)
                        setIsExerciseOpen(false)
                      }}
                      className={`cursor-pointer rounded-md px-3 py-2 text-sm transition-colors ${
                        exercise === ex 
                          ? 'bg-primary/15 text-primary font-medium' 
                          : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                      }`}
                    >
                      {ex}
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-4 text-sm text-muted-foreground text-center">Nu s-a găsit niciun exercițiu.</li>
                )}
              </ul>
            )}

            {/* AICI APARE MAGIA */}
            {lastPerformance && (
              <span className={`text-xs mt-0.5 ml-1 ${
                lastPerformance.includes("Exercițiu nou") ? "text-muted-foreground" : "text-emerald-500 font-medium"
              }`}>
                {lastPerformance}
              </span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2 mt-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Set #</label>
              <input type="number" min={1} value={setNumber} onChange={(e) => setSetNumber(Number(e.target.value))} className="h-10 px-2 rounded-md border text-center text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Kg</label>
              <input type="number" step="0.5" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0" className="h-10 px-2 rounded-md border text-center text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Reps</label>
              <input type="number" min={0} required value={reps} onChange={(e) => setReps(e.target.value)} placeholder="0" className="h-10 px-2 rounded-md border text-center text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">RIR</label>
              <input type="number" min={0} max={5} value={rir} onChange={(e) => setRir(e.target.value)} placeholder="0" className="h-10 px-2 rounded-md border text-center text-sm" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Tip Set</label>
            <select value={setType} onChange={(e) => setSetType(e.target.value as SetType)} className="h-10 px-3 rounded-md border bg-background text-sm">
              {SET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 mt-2">
            <label className="text-sm font-medium text-muted-foreground">Notițe (opțional, ex: scaunul la 3)</label>
            <input 
              type="text" 
              value={notes} 
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Scrie o notiță scurtă..."
              className="h-9 px-3 rounded-md border bg-background text-sm"
            />
          </div>

          <button 
            type="submit" 
            className="h-10 mt-2 bg-secondary text-secondary-foreground font-medium rounded-md hover:bg-secondary/80 active:scale-95 transition-all"
          >
            + Adaugă Setul
          </button>
        </form>
      )}

      {/* --- FORMULAR CARDIO --- */}
      {mode === "cardio" && (
        <form onSubmit={handleAddCardio} className="flex flex-col gap-4 p-5 border rounded-xl bg-card shadow-sm mb-6">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Activitate (LISS / HIIT)</label>
            <select value={cardioActivity} onChange={(e) => setCardioActivity(e.target.value)} className="h-10 px-3 rounded-md border bg-background text-sm">
              {CARDIO_ACTIVITIES.map((act) => <option key={act} value={act}>{act}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Durată (Minute)</label>
            <input type="number" min={1} required value={cardioDuration} onChange={(e) => setCardioDuration(e.target.value)} placeholder="ex: 30" className="h-10 px-3 rounded-md border bg-background text-sm" />
          </div>

          <button type="submit" className="h-10 mt-2 bg-secondary text-secondary-foreground font-medium rounded-md hover:bg-secondary/80 transition-colors">
            + Adaugă Activitate
          </button>
        </form>
      )}

      {/* --- LISTA DE SETURI / CARDIO DIN SESIUNE --- */}
      <div className="flex-1 flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">
          Sesiunea Curentă
        </h3>

        {mode === "strength" && sessionSets.map((s) => (
          <div key={s.id} className="flex items-center justify-between p-3 border rounded-lg bg-card text-sm shadow-sm">
            <div className="flex flex-col gap-1.5">
              {/* RÂNDUL 1: Nume exercițiu + Badge Colorat */}
              <div className="flex items-center gap-2">
                <span className="font-bold text-muted-foreground">{s.setNumber}.</span>
                <span className="font-semibold">{s.exercise}</span>
                {getSetTypeBadge(s.setType)}
              </div>
              
              {/* RÂNDUL 2: Greutate, Repetări, RIR și Notițe */}
              <div className="text-muted-foreground text-xs flex items-center flex-wrap gap-x-2 gap-y-1">
                <span>
                  {s.weight > 0 ? <span className="font-bold text-foreground">{s.weight}kg</span> : ""}
                  {s.weight > 0 ? " \u00D7 " : ""}
                  <span className="font-bold text-foreground">{s.reps}</span> reps
                </span>
                <span className="opacity-50">•</span> 
                <span>RIR: {s.rir}</span>
                
                {/* Dacă a lăsat o notiță, o afișăm și aici! */}
                {s.notes && (
                  <>
                    <span className="opacity-50">•</span>
                    <span className="text-blue-500/80 italic">📝 {s.notes}</span>
                  </>
                )}
              </div>
            </div>
            
            <button onClick={() => setSessionSets(prev => prev.filter(x => x.id !== s.id))} className="p-2 text-muted-foreground hover:text-red-500 transition-colors bg-secondary/20 hover:bg-red-500/10 rounded-md">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}

        {mode === "cardio" && cardioEntries.map((c) => (
          <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg bg-card text-sm">
            <div className="font-medium">{c.activity} <span className="text-muted-foreground font-normal ml-2">({c.durationMin} min)</span></div>
            <button onClick={() => setCardioEntries(prev => prev.filter(x => x.id !== c.id))} className="p-2 text-muted-foreground hover:text-red-500">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-500 mt-4 font-medium">{error}</p>}

      {/* BUTONUL FINAL DE SALVARE */}
      {((mode === "strength" && sessionSets.length > 0) || (mode === "cardio" && cardioEntries.length > 0)) && (
        <button
          onClick={handleFinish}
          disabled={isSaving}
          className="h-12 w-full mt-6 bg-foreground text-background font-medium rounded-xl flex items-center justify-center gap-2 hover:bg-foreground/90 disabled:opacity-50 transition-colors"
        >
          {isSaving ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />}
          Finalizează și Salvează
        </button>
      )}
    </main>
  )
}