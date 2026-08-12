"use client"

import { useState, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Loader2, Save, Trash2, Dumbbell, Heart, Search } from "lucide-react"

import { EXERCISES, SPLITS, SET_TYPES, CARDIO_ACTIVITIES, type Split, type SetType, getExercisesForSplit } from "@/lib/workout-data"
import { updateWorkout } from "./actions"

// --- FUNCȚIE PENTRU ETICHETE COLORATE (Din Insert) ---
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

export default function EditWorkoutForm({ initialWorkout }: { initialWorkout: any }) {
  const router = useRouter()
  const [isSaving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Dată
  const formattedDate = initialWorkout.performed_on 
    ? new Date(initialWorkout.performed_on).toISOString().split('T')[0] 
    : new Date().toISOString().split('T')[0]
  const [performedOn, setPerformedOn] = useState<string>(formattedDate)

  const isCardio = initialWorkout.workout_mode === "cardio"
  const [mode] = useState<"strength" | "cardio">(isCardio ? "cardio" : "strength")
  
  // Date existente
  const mappedSets = (initialWorkout.workout_sets || []).map((s: any) => ({
    id: s.id, split: s.split, exercise: s.exercise, setNumber: s.set_number,
    reps: s.reps, weight: s.weight, rir: s.rir, setType: s.set_type
  })).sort((a: any, b: any) => a.setNumber - b.setNumber)

  const mappedCardio = (initialWorkout.cardio_sessions || []).map((c: any) => ({
    id: c.id, activity: c.activity, durationMin: c.duration_min
  }))

  const [sessionSets, setSessionSets] = useState<any[]>(mappedSets)
  const [cardioEntries, setCardioEntries] = useState<any[]>(mappedCardio)

  // Formular Strength
  const [split, setSplit] = useState<Split>(initialWorkout.split || "Push")
  const [availableExercises, setAvailableExercises] = useState<string[]>(getExercisesForSplit(initialWorkout.split || "Push"))
  const [exercise, setExercise] = useState(availableExercises[0])
  const [weight, setWeight] = useState("")
  const [reps, setReps] = useState("")
  const [rir, setRir] = useState("")
  const [setType, setSetType] = useState<SetType>("Working Set")

  const [exerciseQuery, setExerciseQuery] = useState("")
  const [isExerciseOpen, setIsExerciseOpen] = useState(false)

  // Formular Cardio
  const [cardioActivity, setCardioActivity] = useState(CARDIO_ACTIVITIES[0])
  const [cardioDuration, setCardioDuration] = useState("")

  // Reset exerciții la schimbarea split-ului (exact ca la insert)
  useEffect(() => {
    const newExercises = getExercisesForSplit(split)
    setAvailableExercises(newExercises)
    setExercise(newExercises[0]) 
    setExerciseQuery("") 
  }, [split])

  function handleAddSet(e: React.FormEvent) {
    e.preventDefault()
    if (!exercise || reps === "") return
    const newSet = {
      id: Math.random().toString(36).substring(2, 9),
      split, exercise, setNumber: sessionSets.length + 1,
      reps: Number(reps), weight: weight === "" ? 0 : Number(weight),
      rir: rir === "" ? 0 : Number(rir), setType
    }
    setSessionSets((prev) => [...prev, newSet])
    setReps("") 
    setRir("")
  }

  function handleAddCardio(e: React.FormEvent) {
    e.preventDefault()
    if (!cardioActivity || cardioDuration === "") return
    const newEntry = {
      id: Math.random().toString(36).substring(2, 9),
      activity: cardioActivity, durationMin: Number(cardioDuration)
    }
    setCardioEntries((prev) => [...prev, newEntry])
    setCardioDuration("")
  }

  function handleFinish() {
    setError(null)
    startSaving(async () => {
      const result = await updateWorkout(initialWorkout.id, mode, split, performedOn, sessionSets, cardioEntries)
      if (result.error) {
        setError(result.error)
        return
      }
      router.push("/?history=true")
      router.refresh()
    })
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col p-5 bg-zinc-950 text-zinc-100">
      
      {/* HEADER */}
      <header className="flex flex-col gap-6 mb-6 mt-2">
        <Link href="/?history=true" className="p-2.5 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-xl transition-all border border-transparent hover:border-zinc-800 w-fit">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-3">
          <div className={`flex size-12 items-center justify-center rounded-2xl border shadow-inner ${mode === "cardio" ? "bg-rose-500/10 border-rose-500/20 text-rose-500" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"}`}>
            {mode === "cardio" ? <Heart className="size-6 fill-rose-500/20" /> : <Dumbbell className="size-6" />}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Editare Sesiune</h1>
        </div>
      </header>

      {/* CÂMPUL PENTRU DATA ANTRENAMENTULUI */}
      <div className="flex flex-col gap-1.5 mb-6 p-4 border border-zinc-800/80 rounded-2xl bg-zinc-900/40 shadow-sm backdrop-blur-sm">
        <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1">Data Antrenamentului</label>
        <input 
          type="date" 
          value={performedOn} 
          onChange={(e) => setPerformedOn(e.target.value)}
          className="h-12 px-4 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-200 text-sm focus:border-emerald-500 outline-none transition-all shadow-inner"
        />
      </div>
      
      {/* FORMULAR ADAUGARE (în funcție de mod) */}
      {mode === "strength" ? (
        <form onSubmit={handleAddSet} className="flex flex-col gap-4 p-5 border border-zinc-800/80 rounded-3xl bg-zinc-900/40 shadow-xl backdrop-blur-sm mb-6">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1">Split General</label>
            <select value={split} onChange={(e) => setSplit(e.target.value as Split)} className="h-12 px-4 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-200 text-sm focus:border-emerald-500 outline-none transition-all">
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
          </div>

          <div className="grid grid-cols-3 gap-3 mt-2">
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
          <button type="submit" className="h-12 mt-3 bg-zinc-800 text-zinc-100 font-bold rounded-xl hover:bg-zinc-700 border border-zinc-700/50 active:scale-[0.98] transition-all shadow-sm">
            + Adaugă Setul Nou
          </button>
        </form>
      ) : (
        <form onSubmit={handleAddCardio} className="flex flex-col gap-4 p-5 border border-zinc-800/80 rounded-3xl bg-zinc-900/40 shadow-xl backdrop-blur-sm mb-6">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1">Activitate (LISS / HIIT)</label>
            <select value={cardioActivity} onChange={(e) => setCardioActivity(e.target.value)} className="h-12 px-4 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-200 text-sm focus:border-rose-500 outline-none transition-all">
              {CARDIO_ACTIVITIES.map((act) => <option key={act} value={act}>{act}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1">Durată (Minute)</label>
            <input type="number" min={1} required value={cardioDuration} onChange={(e) => setCardioDuration(e.target.value)} placeholder="ex: 30" className="h-12 px-4 rounded-xl border border-zinc-800 bg-zinc-950 text-rose-400 font-bold text-lg focus:border-rose-500 outline-none transition-all placeholder:text-zinc-700" />
          </div>
          <button type="submit" className="h-12 mt-3 bg-zinc-800 text-zinc-100 font-bold rounded-xl hover:bg-zinc-700 border border-zinc-700/50 active:scale-[0.98] transition-all shadow-sm">
            + Adaugă Activitate
          </button>
        </form>
      )}

      {/* --- LISTA DE SETURI (MODIFICABILĂ) --- */}
      <div className="flex-1 flex flex-col gap-3">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-1">
          Seturi Existente
        </h3>
        {mode === "strength" && sessionSets.map((s, idx) => (
          <div key={s.id} className="flex items-center justify-between p-4 border border-zinc-800/60 rounded-2xl bg-zinc-900/40 shadow-md backdrop-blur-sm">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-zinc-500 font-bold">#{idx + 1}</span>
                <span className="font-bold text-zinc-200">{s.exercise}</span>
                {getSetTypeBadge(s.setType || s.set_type)}
              </div>
              
              <div className="text-zinc-400 text-xs flex items-center flex-wrap gap-x-2.5 gap-y-1.5 font-mono">
                <span>
                  {s.weight > 0 ? <span className="font-bold text-emerald-400">{s.weight} kg</span> : ""}
                  {s.weight > 0 ? " × " : ""}
                  <span className="font-bold text-zinc-100 text-sm">{s.reps}</span> reps
                </span>
                <span className="opacity-30">•</span> 
                <span>{s.rir} RIR</span>
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

      <button
        onClick={handleFinish}
        disabled={isSaving}
        className={`h-14 w-full mt-8 mb-4 ${mode === 'cardio' ? 'bg-rose-500 hover:bg-rose-400 shadow-rose-500/20' : 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/20'} text-zinc-950 font-extrabold text-lg rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg`}
      >
        {isSaving ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />}
        Salvează Modificările
      </button>
    </main>
  )
}