"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Dumbbell, Heart, Loader2, Save, Trash2, Search, Zap } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import confetti from "canvas-confetti"

import { saveWorkout } from "./action"
import { EXERCISES, SPLITS, SET_TYPES, CARDIO_ACTIVITIES, type Split, type SetType, getExercisesForSplit } from "@/lib/workout-data"

const DRAFT_KEY = "workout_draft_v1"

// --- FUNCȚIE PENTRU ETICHETE COLORATE (PREMIUM DESIGN) ---
const getSetTypeBadge = (type: string) => {
  const t = type?.toLowerCase() || ""
  const baseClasses = "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border"
  
  if (t.includes("warm") || t.includes("încălzire")) return <span className={`${baseClasses} bg-blue-500/10 text-blue-400 border-blue-500/20`}>Warmup</span>
  if (t.includes("feeder")) return <span className={`${baseClasses} bg-yellow-500/10 text-yellow-400 border-yellow-500/20`}>Feeder</span>
  if (t.includes("work")) return <span className={`${baseClasses} bg-emerald-500/10 text-emerald-400 border-emerald-500/20`}>Working</span>
  if (t.includes("top")) return <span className={`${baseClasses} bg-purple-500/10 text-purple-400 border-purple-500/20`}>Top Set</span>
  if (t.includes("back") || t.includes("backoff")) return <span className={`${baseClasses} bg-indigo-500/10 text-indigo-400 border-indigo-500/20`}>Backoff</span>
  if (t.includes("drop") || t.includes("fail")) return <span className={`${baseClasses} bg-red-500/10 text-red-400 border-red-500/20`}>{type}</span>
  
  return <span className={`${baseClasses} bg-zinc-800 text-zinc-300 border-zinc-700/50`}>{type}</span>
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
  const [availableExercises, setAvailableExercises] = useState<string[]>(getExercisesForSplit("Push"))
  const [exercise, setExercise] = useState(availableExercises[0])
  const [setNumber, setSetNumber] = useState(1)
  const [reps, setReps] = useState("")
  const [weight, setWeight] = useState("")
  const [rir, setRir] = useState("")
  const [setType, setSetType] = useState<SetType>("Working Set")

  const [exerciseQuery, setExerciseQuery] = useState("")
  const [isExerciseOpen, setIsExerciseOpen] = useState(false)
  const [lastPerformance, setLastPerformance] = useState<string | null>(null)
  
  // Formular Cardio
  const [cardioActivity, setCardioActivity] = useState(CARDIO_ACTIVITIES[0])
  const [cardioDuration, setCardioDuration] = useState("")
  
  // Reset exerciții la schimbarea split-ului
  useEffect(() => {
    const newExercises = getExercisesForSplit(split)
    setAvailableExercises(newExercises)
    setExercise(newExercises[0]) 
    setExerciseQuery("") 
  }, [split])

  const [bestPerformance, setBestPerformance] = useState<{
    weight: number;
    reps: number;
    rir: number;
    notes?: string;
  } | null>(null)

  // Fetch ultima performanță
  useEffect(() => {
    if (mode !== "strength" || !exercise) return

    async function fetchLastPerformance() {
      setLastPerformance("Se caută istoricul...")
      const supabase = createClient()
      
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

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

      const mostRecentDate = data[0].created_at.split('T')[0]
      const setsFromLastSession = data.filter(s => s.created_at.split('T')[0] === mostRecentDate)
      const bestSet = setsFromLastSession.reduce((prev, current) => {
        const prevWeight = Number(prev.weight);
        const currentWeight = Number(current.weight);
        if (prevWeight > currentWeight || (prevWeight === currentWeight && Number(prev.reps) > Number(current.reps)))
          return prev; 
        return current;
      })

      const weightText = bestSet.weight > 0 ? `${bestSet.weight}kg × ` : ""
      const notesText = bestSet.notes ? ` (${bestSet.notes})` : "" 

      setBestPerformance({
        weight: Number(bestSet.weight),
        reps: Number(bestSet.reps),
        rir: Number(bestSet.rir),
        notes: bestSet.notes
      })
      
      setLastPerformance(`Ultima oară: ${weightText}${bestSet.reps} reps (RIR ${bestSet.rir})${notesText}`)
    }

    fetchLastPerformance()
  }, [exercise, mode])

  // Local Storage
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
        console.error("Eroare ciornă:", e)
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

  // Handler Adăugare Set
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
        particleCount: 50,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#10b981', '#34d399', '#059669'], // Culori smarald de PR
        zIndex: 100, 
      }) 
      
      setBestPerformance({
        weight: newSet.weight,
        reps: newSet.reps,
        rir: newSet.rir,
        notes: newSet.notes
      });

      const weightText = newSet.weight > 0 ? `${newSet.weight}kg × ` : ""
      const notesText = newSet.notes ? ` (${newSet.notes})` : ""
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
        confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#10b981', '#f59e0b', '#3b82f6'] });
        confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#10b981', '#f59e0b', '#3b82f6'] });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame(); 

      setTimeout(() => {
        router.push("/")
      }, 1500)
    })
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col p-5 bg-zinc-950 text-zinc-100">
      
      {/* HEADER MODERN */}
      <header className="flex flex-col gap-6 mb-6 mt-2">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2.5 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-xl transition-all border border-transparent hover:border-zinc-800">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Antrenament Nou</h1>
        </div>
        
        {/* Toggle Mode Premium */}
        <div className="grid grid-cols-2 gap-1 p-1.5 border border-zinc-800/80 rounded-2xl bg-zinc-900/60 shadow-inner">
          <button
            onClick={() => setMode("strength")}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
              mode === "strength" 
                ? "bg-zinc-800 text-zinc-100 shadow-md border border-zinc-700/50" 
                : "text-zinc-500 hover:text-zinc-300 border border-transparent"
            }`}
          >
            <Dumbbell className="size-4" /> Strength
          </button>
          <button
            onClick={() => setMode("cardio")}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
              mode === "cardio" 
                ? "bg-zinc-800 text-zinc-100 shadow-md border border-zinc-700/50" 
                : "text-zinc-500 hover:text-zinc-300 border border-transparent"
            }`}
          >
            <Heart className="size-4" /> Cardio
          </button>
        </div>
      </header>

      {/* --- FORMULAR STRENGTH --- */}
      {mode === "strength" && (
        <form onSubmit={handleAddSet} className="flex flex-col gap-4 p-5 border border-zinc-800/80 rounded-3xl bg-zinc-900/40 shadow-xl backdrop-blur-sm mb-6">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1">Split</label>
            <select value={split} onChange={(e) => setSplit(e.target.value as Split)} className="h-12 px-4 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-200 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all">
              {SPLITS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 relative mt-1">
            <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1">Exercițiu / Aparat</label>
            
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
                onBlur={() => setTimeout(() => setIsExerciseOpen(false), 150)}
                placeholder="Caută exercițiul..."
                className="h-12 w-full pl-4 pr-10 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-200 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all shadow-inner"
              />
              <Search className="absolute right-4 top-3.5 size-4 text-zinc-500 pointer-events-none" />
            </div>

            {isExerciseOpen && (
              <ul className="absolute z-[999] top-[76px] left-0 right-0 max-h-60 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-200 p-1.5 shadow-2xl shadow-black">
                {availableExercises.filter(ex => ex.toLowerCase().includes(exerciseQuery.toLowerCase())).length > 0 ? (
                  availableExercises.filter(ex => ex.toLowerCase().includes(exerciseQuery.toLowerCase())).map((ex) => (
                    <li
                      key={ex}
                      onMouseDown={(e) => {
                        e.preventDefault() 
                        setExercise(ex)
                        setIsExerciseOpen(false)
                      }}
                      className={`cursor-pointer rounded-lg px-3 py-2.5 text-sm transition-all ${
                        exercise === ex 
                          ? 'bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/20' 
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

            {lastPerformance && (
              <div className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border w-fit text-[11px] font-bold ${
                lastPerformance.includes("Exercițiu nou") 
                  ? "bg-zinc-950 border-zinc-800 text-zinc-500" 
                  : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              }`}>
                {lastPerformance.includes("Nou Record") ? <Zap className="size-3 fill-emerald-400" /> : null}
                {lastPerformance}
              </div>
            )}
          </div>

          <div className="grid grid-cols-4 gap-3 mt-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-zinc-500 text-center">Set</label>
              <input type="number" min={1} value={setNumber} onChange={(e) => setSetNumber(Number(e.target.value))} className="h-12 px-1 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-200 text-center font-bold text-base focus:border-emerald-500 outline-none transition-colors" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-zinc-500 text-center">Kg</label>
              <input type="number" step="0.5" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0" className="h-12 px-1 rounded-xl border border-zinc-800 bg-zinc-950 text-emerald-400 text-center font-bold text-base focus:border-emerald-500 outline-none transition-colors placeholder:text-zinc-700" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-zinc-500 text-center">Reps</label>
              <input type="number" min={0} required value={reps} onChange={(e) => setReps(e.target.value)} placeholder="0" className="h-12 px-1 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-200 text-center font-bold text-base focus:border-emerald-500 outline-none transition-colors placeholder:text-zinc-700" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-zinc-500 text-center">RIR</label>
              <input type="number" min={0} max={5} value={rir} onChange={(e) => setRir(e.target.value)} placeholder="0" className="h-12 px-1 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-400 text-center font-bold text-base focus:border-emerald-500 outline-none transition-colors placeholder:text-zinc-700" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 mt-1">
            <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1">Tip Set</label>
            <select value={setType} onChange={(e) => setSetType(e.target.value as SetType)} className="h-12 px-4 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-200 text-sm focus:border-emerald-500 outline-none transition-all">
              {SET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 mt-1">
            <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1">Notițe <span className="opacity-60 normal-case font-medium">(opțional)</span></label>
            <input 
              type="text" 
              value={notes} 
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Scaunul la 3..."
              className="h-11 px-4 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-200 text-sm focus:border-emerald-500 outline-none transition-all placeholder:text-zinc-600"
            />
          </div>

          <button 
            type="submit" 
            className="h-12 mt-3 bg-zinc-800 text-zinc-100 font-bold rounded-xl hover:bg-zinc-700 border border-zinc-700/50 active:scale-[0.98] transition-all shadow-sm"
          >
            + Adaugă Setul
          </button>
        </form>
      )}

      {/* --- FORMULAR CARDIO --- */}
      {mode === "cardio" && (
        <form onSubmit={handleAddCardio} className="flex flex-col gap-4 p-5 border border-zinc-800/80 rounded-3xl bg-zinc-900/40 shadow-xl backdrop-blur-sm mb-6">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1">Activitate</label>
            <select value={cardioActivity} onChange={(e) => setCardioActivity(e.target.value)} className="h-12 px-4 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-200 text-sm focus:border-rose-500 outline-none transition-all">
              {CARDIO_ACTIVITIES.map((act) => <option key={act} value={act}>{act}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 mt-1">
            <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1">Durată (Minute)</label>
            <input type="number" min={1} required value={cardioDuration} onChange={(e) => setCardioDuration(e.target.value)} placeholder="ex: 30" className="h-12 px-4 rounded-xl border border-zinc-800 bg-zinc-950 text-rose-400 font-bold text-lg focus:border-rose-500 outline-none transition-all placeholder:text-zinc-700" />
          </div>

          <button type="submit" className="h-12 mt-3 bg-zinc-800 text-zinc-100 font-bold rounded-xl hover:bg-zinc-700 border border-zinc-700/50 active:scale-[0.98] transition-all shadow-sm">
            + Adaugă Activitate
          </button>
        </form>
      )}

      {/* --- LISTA DE SETURI CURENTE --- */}
      <div className="flex-1 flex flex-col gap-3">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-1">
          Sesiunea Curentă
        </h3>

        {mode === "strength" && sessionSets.map((s) => (
          <div key={s.id} className="flex items-center justify-between p-4 border border-zinc-800/60 rounded-2xl bg-zinc-900/40 shadow-md backdrop-blur-sm">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-zinc-500 font-bold">#{s.setNumber}</span>
                <span className="font-bold text-zinc-200">{s.exercise}</span>
                {getSetTypeBadge(s.setType)}
              </div>
              
              <div className="text-zinc-400 text-xs flex items-center flex-wrap gap-x-2.5 gap-y-1.5 font-mono">
                <span>
                  {s.weight > 0 ? <span className="font-bold text-emerald-400">{s.weight} kg</span> : ""}
                  {s.weight > 0 ? " × " : ""}
                  <span className="font-bold text-zinc-100 text-sm">{s.reps}</span> reps
                </span>
                <span className="opacity-30">•</span> 
                <span>{s.rir} RIR</span>
                
                {s.notes && (
                  <>
                    <span className="opacity-30">•</span>
                    <span className="text-blue-400/90 font-sans italic">📝 {s.notes}</span>
                  </>
                )}
              </div>
            </div>
            
            <button onClick={() => setSessionSets(prev => prev.filter(x => x.id !== s.id))} className="p-2.5 text-red-500 hover:text-red-400 transition-colors bg-zinc-950 border border-zinc-800 hover:border-red-500/30 hover:bg-red-500/10 rounded-xl active:scale-95">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}

        {mode === "cardio" && cardioEntries.map((c) => (
          <div key={c.id} className="flex items-center justify-between p-4 border border-zinc-800/60 rounded-2xl bg-zinc-900/40 shadow-md backdrop-blur-sm">
            <div className="font-bold text-zinc-200">{c.activity} <span className="font-mono text-rose-400 font-normal ml-2">({c.durationMin} min)</span></div>
            <button onClick={() => setCardioEntries(prev => prev.filter(x => x.id !== c.id))} className="p-2.5 text-red-500 hover:text-red-400 transition-colors bg-zinc-950 border border-zinc-800 hover:border-red-500/30 hover:bg-red-500/10 rounded-xl active:scale-95">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-500 mt-4 font-bold text-center bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</p>}

      {/* BUTONUL FINAL DE SALVARE MASIV */}
      {((mode === "strength" && sessionSets.length > 0) || (mode === "cardio" && cardioEntries.length > 0)) && (
        <button
          onClick={handleFinish}
          disabled={isSaving}
          className="h-14 w-full mt-8 mb-4 bg-emerald-500 text-zinc-950 font-extrabold text-lg rounded-2xl flex items-center justify-center gap-2 hover:bg-emerald-400 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20"
        >
          {isSaving ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />}
          Finalizează Antrenamentul
        </button>
      )}
    </main>
  )
}