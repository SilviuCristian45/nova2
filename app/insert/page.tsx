
"use client"

import { Text, useLanguage } from "@/app/components/language-provider"
import { WorkoutLabel } from "@/app/components/workout-label"
import { useEffect, useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Dumbbell, Heart, Loader2, Save, Trash2, Search, Zap, Play, Pause, Square } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import confetti from "canvas-confetti"

import { saveWorkout } from "./action"
import { SPLITS, SET_TYPES, CARDIO_ACTIVITIES, type Split, type SetType, getExercisesForSplit } from "@/lib/workout-data"
import type { OfflineCardio, OfflineSet } from "@/lib/offline/types"
import { saveOfflineMutation, useOffline } from "@/lib/offline/client"
import { localDate } from "@/lib/daily-metrics"
import { readOfflineDatabase } from "@/lib/offline/store"

const DRAFT_KEY = "workout_draft_v1"

// --- FUNCȚIE PENTRU ETICHETE COLORATE (PREMIUM DESIGN) ---
const getSetTypeBadge = (type: string) => {
  const t = type?.toLowerCase() || ""
  const baseClasses = "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border"
  
  if (t.includes("warm") || t.includes("încălzire")) return <span className={`${baseClasses} bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20`}><Text ro="Încălzire" en="Warmup" /></span>
  if (t.includes("feeder")) return <span className={`${baseClasses} bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20`}><Text ro="Pregătire" en="Feeder" /></span>
  if (t.includes("work")) return <span className={`${baseClasses} bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20`}><Text ro="Lucru" en="Working" /></span>
  if (t.includes("top")) return <span className={`${baseClasses} bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20`}><Text ro="Set maxim" en="Top Set" /></span>
  if (t.includes("back") || t.includes("backoff")) return <span className={`${baseClasses} bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20`}><Text ro="Set redus" en="Backoff" /></span>
  if (t.includes("drop") || t.includes("fail")) return <span className={`${baseClasses} bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20`}><WorkoutLabel value={type} /></span>
  
  return <span className={`${baseClasses} bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300/50 dark:border-zinc-700/50`}><WorkoutLabel value={type} /></span>
}

export default function InsertWorkoutPage() {
  const { t } = useLanguage()
  const { ownerId, ready } = useOffline()
  const draftKey = ownerId ? `${DRAFT_KEY}_${ownerId}` : null
  const [loadedDraftKey, setLoadedDraftKey] = useState<string | null>(null)

  const router = useRouter()
  const [isSaving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<string>("")

  // State general
  const [mode, setMode] = useState<"strength" | "cardio">("strength")
  const [sessionSets, setSessionSets] = useState<(OfflineSet & { id: string })[]>([])
  const [cardioEntries, setCardioEntries] = useState<(OfflineCardio & { id: string })[]>([])

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

  // --- STATE PENTRU TIMER ---
  const [time, setTime] = useState(0) // Timpul în secunde
  const [isRunning, setIsRunning] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Curăță timerul când componenta este demontată
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const startTimer = () => {
    if (!isRunning) {
      setIsRunning(true)
      timerRef.current = setInterval(() => {
        setTime(prev => prev + 1)
      }, 1000)
    }
  }

  const pauseTimer = () => {
    setIsRunning(false)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  const resetTimer = () => {
    pauseTimer()
    setTime(0)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  // --------------------------
  
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
      setLastPerformance(t("Se caută istoricul...", "Loading history..."))
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
        setLastPerformance(t("Exercițiu nou. Setează primul record!", "New exercise. Set your first record!"))
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
      
      setLastPerformance(`${t("Ultima oară", "Last time")}: ${weightText}${bestSet.reps} ${t("repetări", "reps")} (RIR ${bestSet.rir})${notesText}`)
    }

    fetchLastPerformance()
  }, [exercise, mode, t])

  // Local Storage
  useEffect(() => {
    if (!draftKey) return
    const key = draftKey
    let cancelled = false
    async function restore() {
      try {
        const state = await readOfflineDatabase()
        if (cancelled || state.activeOwner !== ownerId) return
        const draft = localStorage.getItem(key)
        const parsed = draft ? JSON.parse(draft) : { sets: [], cardio: [], mode: "strength" }
        if (!Array.isArray(parsed.sets) || !Array.isArray(parsed.cardio)) throw new Error("Invalid workout draft")
        setSessionSets(parsed.sets)
        setCardioEntries(parsed.cardio)
        setMode(parsed.mode === "cardio" ? "cardio" : "strength")
        setSetNumber(parsed.sets.length + 1)
        setLoadedDraftKey(key)
      } catch (error) {
        console.error("Workout draft could not be loaded:", error)
        if (!cancelled) setError("Workout draft could not be loaded. / Ciorna nu a putut fi încărcată.")
      }
    }
    void restore()
    return () => { cancelled = true }
  }, [draftKey, ownerId])

  useEffect(() => {
    if (!draftKey || loadedDraftKey !== draftKey) return
    const key = draftKey
    let cancelled = false
    async function persist() {
      try {
        const state = await readOfflineDatabase()
        if (cancelled || state.activeOwner !== ownerId) return
        if (sessionSets.length || cardioEntries.length) localStorage.setItem(key, JSON.stringify({ sets: sessionSets, cardio: cardioEntries, mode }))
        else localStorage.removeItem(key)
      } catch (error) {
        console.error("Workout draft could not be stored:", error)
        if (!cancelled) setError(t("Ciorna nu a putut fi salvată pe dispozitiv.", "The workout draft could not be saved on this device."))
      }
    }
    void persist()
    return () => { cancelled = true }
  }, [sessionSets, cardioEntries, mode, draftKey, loadedDraftKey, ownerId, t])

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
      setLastPerformance(`🏆 ${t("Nou record", "New record")}: ${weightText}${newSet.reps} ${t("repetări", "reps")} (RIR ${newSet.rir})${notesText}`)
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
      if (ownerId) {
        try {
          await saveOfflineMutation({
            kind: "workout", date: localDate(), mode, split,
            sets: mode === "strength" ? sessionSets : [],
            cardio: mode === "cardio" ? cardioEntries : [],
          }, ownerId)
          try { if (draftKey) localStorage.removeItem(draftKey) }
          catch (error) { console.error("Saved workout draft could not be removed:", error) }
          window.location.assign("/offline")
        } catch (error) {
          setError(error instanceof Error ? error.message : t("Salvarea a eșuat.", "Save failed."))
        }
        return
      }
      const result = await saveWorkout(mode, split, sessionSets, cardioEntries)
      
      if (result.error) {
        setError(result.error)
        return
      }

      if (draftKey) localStorage.removeItem(draftKey)

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

  if (!ready || (ownerId && loadedDraftKey !== draftKey && !error)) {
    return <main className="mx-auto w-full max-w-6xl p-5"><p role="status">{t("Se încarcă jurnalul local...", "Loading local log...")}</p></main>
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col p-5 lg:px-8 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      
      {/* HEADER MODERN */}
      <header className="flex flex-col gap-6 mb-6 mt-2">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2.5 -ml-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-xl transition-all border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800">
            <ArrowLeft className="size-5" />
          <span className="sr-only"><Text ro="Înapoi" en="Back" /></span></Link>
          <h1 className="text-2xl font-bold tracking-tight"><Text ro="Antrenament Nou" en="New workout" /></h1>
        </div>
        
        {/* Toggle Mode Premium */}
        <div className="grid grid-cols-2 gap-1 p-1.5 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl bg-zinc-100 dark:bg-zinc-900/60 shadow-inner">
          <button
            onClick={() => setMode("strength")}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
              mode === "strength" 
                ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-md border border-zinc-300/50 dark:border-zinc-700/50"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border border-transparent"
            }`}
          >
            <Dumbbell className="size-4" /> <Text ro="Forță" en="Strength" />
          </button>
          <button
            onClick={() => setMode("cardio")}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
              mode === "cardio" 
                ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-md border border-zinc-300/50 dark:border-zinc-700/50"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border border-transparent"
            }`}
          >
            <Heart className="size-4" /> Cardio
          </button>
        </div>
      </header>

      {/* --- TIMER PREMIUM --- */}
      <div className="flex items-center justify-between p-4 mb-6 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl bg-zinc-100 dark:bg-zinc-900/40 shadow-md backdrop-blur-sm">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-500"><Text ro="Cronometru" en="Timer" /></span>
          <span className={`text-2xl font-mono font-bold ${isRunning ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
            {formatTime(time)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isRunning ? (
            <button 
              onClick={startTimer}
              className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors"
            >
              <Play className="size-5" />
            <span className="sr-only"><Text ro="Pornește cronometrul" en="Start timer" /></span></button>
          ) : (
            <button 
              onClick={pauseTimer}
              className="p-2.5 rounded-xl bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/20 transition-colors"
            >
              <Pause className="size-5" />
            <span className="sr-only"><Text ro="Pauză cronometru" en="Pause timer" /></span></button>
          )}
          <button 
            onClick={resetTimer}
            className="p-2.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors border border-zinc-300/50 dark:border-zinc-700/50"
          >
            <Square className="size-4" />
          <span className="sr-only"><Text ro="Resetează cronometrul" en="Reset timer" /></span></button>
        </div>
      </div>

      {/* --- FORMULAR STRENGTH --- */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      {mode === "strength" && (
        <form onSubmit={handleAddSet} className="flex flex-col gap-4 p-5 border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl bg-zinc-100 dark:bg-zinc-900/40 shadow-xl backdrop-blur-sm mb-6">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1"><Text ro="Împărțire" en="Split" /></label>
            <select value={split} onChange={(e) => setSplit(e.target.value as Split)} className="h-12 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all">
              {SPLITS.map((s) => <option key={s} value={s}><WorkoutLabel value={s} /></option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 relative mt-1">
            <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1"><Text ro="Exercițiu / Aparat" en="Exercise / Machine" /></label>
            
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
                placeholder={t("Caută exercițiul...", "Search exercises...")}
                className="h-12 w-full pl-4 pr-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all shadow-inner"
              />
              <Search className="absolute right-4 top-3.5 size-4 text-zinc-500 pointer-events-none" />
            </div>

            {isExerciseOpen && (
              <ul className="absolute z-[999] top-[76px] left-0 right-0 max-h-60 overflow-y-auto rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 p-1.5 shadow-2xl shadow-black">
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
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-500/20'
                          : 'hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 border border-transparent'
                      }`}
                    >
                      {ex}
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-4 text-sm text-zinc-500 text-center font-medium"><Text ro="Nu am găsit acest exercițiu." en="No matching exercise found." /></li>
                )}
              </ul>
            )}

            {lastPerformance && (
              <div className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border w-fit text-[11px] font-bold ${
                lastPerformance.includes(t("Exercițiu nou", "New exercise"))
                  ? "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500"
                  : "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
              }`}>
                {lastPerformance.startsWith("🏆") ? <Zap className="size-3 fill-emerald-400" /> : null}
                {lastPerformance}
              </div>
            )}
          </div>

          <div className="grid grid-cols-4 gap-3 mt-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-zinc-500 text-center"><Text ro="Set" en="Set" /></label>
              <input type="number" min={1} value={setNumber} onChange={(e) => setSetNumber(Number(e.target.value))} className="h-12 px-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 text-center font-bold text-base focus:border-emerald-500 outline-none transition-colors" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-zinc-500 text-center">Kg</label>
              <input type="number" step="0.5" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0" className="h-12 px-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-emerald-700 dark:text-emerald-400 text-center font-bold text-base focus:border-emerald-500 outline-none transition-colors placeholder:text-zinc-600 dark:placeholder:text-zinc-700" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-zinc-500 text-center"><Text ro="Repetări" en="Reps" /></label>
              <input type="number" min={0} required value={reps} onChange={(e) => setReps(e.target.value)} placeholder="0" className="h-12 px-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 text-center font-bold text-base focus:border-emerald-500 outline-none transition-colors placeholder:text-zinc-600 dark:placeholder:text-zinc-700" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-zinc-500 text-center">RIR</label>
              <input type="number" min={0} max={5} value={rir} onChange={(e) => setRir(e.target.value)} placeholder="0" className="h-12 px-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 text-center font-bold text-base focus:border-emerald-500 outline-none transition-colors placeholder:text-zinc-600 dark:placeholder:text-zinc-700" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 mt-1">
            <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1"><Text ro="Tip Set" en="Set type" /></label>
            <select value={setType} onChange={(e) => setSetType(e.target.value as SetType)} className="h-12 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 text-sm focus:border-emerald-500 outline-none transition-all">
              {SET_TYPES.map((type) => <option key={type} value={type}><WorkoutLabel value={type} /></option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 mt-1">
            <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1"><Text ro="Notițe" en="Notes" /> <span className="opacity-60 normal-case font-medium"><Text ro="(opțional)" en="(optional)" /></span></label>
            <input 
              type="text" 
              value={notes} 
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("Ex: Scaunul la 3...", "E.g. Seat at 3...")}
              className="h-11 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 text-sm focus:border-emerald-500 outline-none transition-all placeholder:text-zinc-500 dark:placeholder:text-zinc-600"
            />
          </div>

          <button 
            type="submit" 
            className="h-12 mt-3 bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold rounded-xl hover:bg-zinc-300 dark:hover:bg-zinc-700 border border-zinc-300/50 dark:border-zinc-700/50 active:scale-[0.98] transition-all shadow-sm"
          >
            <Text ro="+ Adaugă Setul" en="+ Add set" />
          </button>
        </form>
      )}

      {/* --- FORMULAR CARDIO --- */}
      {mode === "cardio" && (
        <form onSubmit={handleAddCardio} className="flex flex-col gap-4 p-5 border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl bg-zinc-100 dark:bg-zinc-900/40 shadow-xl backdrop-blur-sm mb-6">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1"><Text ro="Activitate (LISS / HIIT)" en="Activity (LISS / HIIT)" /></label>
            <select value={cardioActivity} onChange={(e) => setCardioActivity(e.target.value)} className="h-12 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 text-sm focus:border-rose-500 outline-none transition-all">
              {CARDIO_ACTIVITIES.map((act) => <option key={act} value={act}>{act}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 mt-1">
            <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1"><Text ro="Durată (Minute)" en="Duration (minutes)" /></label>
            <input type="number" min={1} required value={cardioDuration} onChange={(e) => setCardioDuration(e.target.value)} placeholder={t("ex: 30", "e.g. 30")} className="h-12 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-rose-700 dark:text-rose-400 font-bold text-lg focus:border-rose-500 outline-none transition-all placeholder:text-zinc-600 dark:placeholder:text-zinc-700" />
          </div>

          <button type="submit" className="h-12 mt-3 bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold rounded-xl hover:bg-zinc-300 dark:hover:bg-zinc-700 border border-zinc-300/50 dark:border-zinc-700/50 active:scale-[0.98] transition-all shadow-sm">
            <Text ro="+ Adaugă Activitate" en="+ Add activity" />
          </button>
        </form>
      )}

      {/* --- LISTA DE SETURI CURENTE --- */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-1">
          <Text ro="Sesiunea Curentă" en="Current session" />
        </h3>

        {mode === "strength" && sessionSets.map((s) => (
          <div key={s.id} className="flex items-center justify-between p-4 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl bg-zinc-100 dark:bg-zinc-900/40 shadow-md backdrop-blur-sm">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-zinc-500 font-bold">#{s.setNumber}</span>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">{s.exercise}</span>
                {getSetTypeBadge(s.setType)}
              </div>
              
              <div className="text-zinc-600 dark:text-zinc-400 text-xs flex items-center flex-wrap gap-x-2.5 gap-y-1.5 font-mono">
                <span>
                  {s.weight > 0 ? <span className="font-bold text-emerald-700 dark:text-emerald-400">{s.weight} kg</span> : ""}
                  {s.weight > 0 ? " × " : ""}
                  <span className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">{s.reps}</span> <Text ro="repetări" en="reps" />
                </span>
                <span className="opacity-30">•</span> 
                <span>{s.rir} RIR</span>
                
                {s.notes && (
                  <>
                    <span className="opacity-30">•</span>
                    <span className="text-blue-700/90 dark:text-blue-400/90 font-sans italic">📝 {s.notes}</span>
                  </>
                )}
              </div>
            </div>
            
            <button onClick={() => setSessionSets(prev => prev.filter(x => x.id !== s.id))} className="p-2.5 text-red-700 dark:text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:border-red-500/30 hover:bg-red-500/10 rounded-xl active:scale-95">
              <Trash2 className="size-4" />
            <span className="sr-only"><Text ro="Elimină" en="Remove" /></span></button>
          </div>
        ))}

        {mode === "cardio" && cardioEntries.map((c) => (
          <div key={c.id} className="flex items-center justify-between p-4 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl bg-zinc-100 dark:bg-zinc-900/40 shadow-md backdrop-blur-sm">
            <div className="font-bold text-zinc-800 dark:text-zinc-200">{c.activity} <span className="font-mono text-rose-700 dark:text-rose-400 font-normal ml-2">({c.durationMin} min)</span></div>
            <button onClick={() => setCardioEntries(prev => prev.filter(x => x.id !== c.id))} className="p-2.5 text-red-700 dark:text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:border-red-500/30 hover:bg-red-500/10 rounded-xl active:scale-95">
              <Trash2 className="size-4" />
            <span className="sr-only"><Text ro="Elimină" en="Remove" /></span></button>
          </div>
        ))}
      </div>
      </div>

      {error && <p className="text-sm text-red-700 dark:text-red-500 mt-4 font-bold text-center bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</p>}

      {/* BUTONUL FINAL DE SALVARE MASIV */}
      {((mode === "strength" && sessionSets.length > 0) || (mode === "cardio" && cardioEntries.length > 0)) && (
        <button
          onClick={handleFinish}
          disabled={isSaving}
          className="h-14 w-full mt-8 mb-4 bg-emerald-500 text-zinc-950 font-extrabold text-lg rounded-2xl flex items-center justify-center gap-2 hover:bg-emerald-400 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20"
        >
          {isSaving ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />}
          <Text ro="Finalizează Antrenamentul" en="Finish workout" />
        </button>
      )}
    </main>
  )
}
