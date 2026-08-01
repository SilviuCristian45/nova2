"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Loader2, Save, Trash2, Dumbbell, Heart } from "lucide-react"

import { EXERCISES, SPLITS, SET_TYPES, CARDIO_ACTIVITIES, type Split, type SetType } from "@/lib/workout-data"
import { updateWorkout } from "./actions"

export default function EditWorkoutForm({ initialWorkout }: { initialWorkout: any }) {
  const router = useRouter()
  const [isSaving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Extragem data existentă formatată pentru input (YYYY-MM-DD)
  const formattedDate = initialWorkout.performed_on 
    ? new Date(initialWorkout.performed_on).toISOString().split('T')[0] 
    : new Date().toISOString().split('T')[0]

  const [performedOn, setPerformedOn] = useState<string>(formattedDate)

  // Inițializăm state-urile cu datele vechi
  const isCardio = initialWorkout.workout_mode === "cardio"
  const [mode] = useState<"strength" | "cardio">(isCardio ? "cardio" : "strength")
  
  // Formatăm datele venite din DB ca să se potrivească cu structura noastră de pe client
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
  const [exercise, setExercise] = useState(EXERCISES[0])
  const [weight, setWeight] = useState("")
  const [reps, setReps] = useState("")
  const [rir, setRir] = useState("")
  const [setType, setSetType] = useState<SetType>("Working Set")

  // Formular Cardio
  const [cardioActivity, setCardioActivity] = useState(CARDIO_ACTIVITIES[0])
  const [cardioDuration, setCardioDuration] = useState("")

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
    setReps("") // resetăm doar repetările
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
      router.push("/history")
      router.refresh()
    })
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col p-5 bg-background">
      <header className="flex flex-col gap-4 mb-6">
        <Link href="/history" className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-2 w-fit">
          <ArrowLeft className="size-4" /> Înapoi la Istoric
        </Link>
        <div className="flex items-center gap-2">
          {mode === "cardio" ? <Heart className="size-6 text-red-500" /> : <Dumbbell className="size-6 text-primary" />}
          <h1 className="text-2xl font-bold tracking-tight">Editează Antrenament</h1>
        </div>
      </header>

      {/* --- FORMULAR ADAUGARE (în funcție de mod) --- */}
      {mode === "strength" ? (
        <form onSubmit={handleAddSet} className="flex flex-col gap-4 p-5 border rounded-xl bg-card shadow-sm mb-6">
          {/* ... ACELEAȘI CÂMPURI CA LA INSERT ... */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Split General</label>
            <select value={split} onChange={(e) => setSplit(e.target.value as Split)} className="h-10 px-3 rounded-md border bg-background text-sm">
              {SPLITS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {/* --- CÂMPUL PENTRU DATA ANTRENAMENTULUI --- */}
      <div className="flex flex-col gap-1.5 mb-6">
        <label className="text-sm font-medium">Data Antrenamentului</label>
        <input 
          type="date" 
          value={performedOn} 
          onChange={(e) => setPerformedOn(e.target.value)}
          className="h-10 px-3 rounded-md border bg-background text-sm font-medium"
        />
      </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Exercițiu / Aparat</label>
            <select value={exercise} onChange={(e) => setExercise(e.target.value)} className="h-10 px-3 rounded-md border bg-background text-sm">
              {EXERCISES.map((ex) => <option key={ex} value={ex}>{ex}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
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
          <button type="submit" className="h-10 mt-2 bg-secondary text-secondary-foreground font-medium rounded-md hover:bg-secondary/80 transition-colors">
            + Adaugă Setul Nou
          </button>
        </form>
      ) : (
        <form onSubmit={handleAddCardio} className="flex flex-col gap-4 p-5 border rounded-xl bg-card shadow-sm mb-6">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Activitate</label>
            <select value={cardioActivity} onChange={(e) => setCardioActivity(e.target.value)} className="h-10 px-3 rounded-md border bg-background text-sm">
              {CARDIO_ACTIVITIES.map((act) => <option key={act} value={act}>{act}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Durată (Min)</label>
            <input type="number" min={1} required value={cardioDuration} onChange={(e) => setCardioDuration(e.target.value)} className="h-10 px-3 rounded-md border bg-background text-sm" />
          </div>
          <button type="submit" className="h-10 mt-2 bg-secondary text-secondary-foreground font-medium rounded-md hover:bg-secondary/80">
            + Adaugă Activitate Nouă
          </button>
        </form>
      )}

      {/* --- LISTA DE SETURI (MODIFICABILĂ) --- */}
      <div className="flex-1 flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">
          Seturi Existente
        </h3>
        {mode === "strength" && sessionSets.map((s, idx) => (
          <div key={s.id} className="flex items-center justify-between p-3 border rounded-lg bg-card text-sm">
            <div>
              <span className="font-semibold mr-2">{idx + 1}.</span>
              <span className="font-medium">{s.exercise}</span>
              <div className="text-muted-foreground text-xs mt-1">
                {s.weight > 0 ? `${s.weight}kg x ` : ""}{s.reps} reps | RIR: {s.rir} | {s.setType || s.set_type}
              </div>
            </div>
            <button onClick={() => setSessionSets(prev => prev.filter(x => x.id !== s.id))} className="p-2 text-muted-foreground hover:text-red-500">
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

      <button
        onClick={handleFinish}
        disabled={isSaving}
        className="h-12 w-full mt-6 bg-foreground text-background font-medium rounded-xl flex items-center justify-center gap-2 hover:bg-foreground/90 disabled:opacity-50 transition-colors"
      >
        {isSaving ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />}
        Salvează Modificările
      </button>
    </main>
  )
}