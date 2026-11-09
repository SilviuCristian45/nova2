"use client"

import { Text, useLanguage } from "@/app/components/language-provider"
import { workoutLabelText } from "@/app/components/workout-label"
import { useState, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Plus, Save } from "lucide-react"

import { SPLITS, SET_TYPES, CARDIO_ACTIVITIES, type Split, type SetType, getExercisesForSplit } from "@/lib/workout-data"
import { updateWorkout } from "./actions"
import { ExerciseCombobox } from "@/app/components/exercise-combobox"
import { displayOrdinals } from "@/lib/set-numbering"
import { editSetsFromRows } from "@/lib/workout-edit"
import { cardioName } from "@/lib/exercise-catalog"
import { CardioRows, SetRows } from "@/app/components/workout-parts"
import { Button, Card, Field, Input, Message, Screen, Select } from "@/app/components/ui"
import { useUnits } from "@/app/components/units-provider"

export default function EditWorkoutForm({ initialWorkout }: { initialWorkout: any }) {
  const { t, language } = useLanguage()
  const { unit, toUnit, toKg } = useUnits()

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
  const mappedSets = editSetsFromRows(initialWorkout.workout_sets || [])

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


  // Formular Cardio
  const [cardioActivity, setCardioActivity] = useState(CARDIO_ACTIVITIES[0])
  const [cardioDuration, setCardioDuration] = useState("")

  // Reset exerciții la schimbarea split-ului (exact ca la insert)
  useEffect(() => {
    const newExercises = getExercisesForSplit(split)
    setAvailableExercises(newExercises)
    setExercise(newExercises[0]) 
  }, [split])

  // Shown numbers are per exercise; the stored number is the position (see lib/set-numbering.ts).
  const ordinals = displayOrdinals(sessionSets.map((s, index) => ({ exercise: s.exercise, order: index })))

  function handleAddSet(e: React.FormEvent) {
    e.preventDefault()
    if (!exercise || reps === "") return
    const newSet = {
      id: Math.random().toString(36).substring(2, 9),
      split, exercise, setNumber: sessionSets.length + 1,
      reps: Number(reps), weight: weight === "" ? 0 : toKg(Number(weight)),
      rir: rir === "" ? null : Number(rir), setType
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
      router.push("/history")
      router.refresh()
    })
  }

  return (
    <Screen title={<Text ro="Editare sesiune" en="Edit session" />} back="/history">
      <Card>
        <Field label={<Text ro="Data antrenamentului" en="Workout date" />} htmlFor="performed-on">
          <Input id="performed-on" type="date" value={performedOn} onChange={(e) => setPerformedOn(e.target.value)} />
        </Field>
      </Card>

      {mode === "strength" ? (
        <form onSubmit={handleAddSet}>
          <Card>
            <Field label={<Text ro="Split general" en="Workout split" />}>
              <Select
                title={t("Split general", "Workout split")}
                value={split}
                onChange={(value) => setSplit(value as Split)}
                options={SPLITS.map((s) => ({ value: s, label: workoutLabelText(s, t) }))}
              />
            </Field>
            <ExerciseCombobox key={split} exercises={availableExercises} value={exercise} onChange={setExercise} />
            <div className="grid grid-cols-3 gap-2">
              <Field label={unit} htmlFor="edit-weight">
                <Input id="edit-weight" big compact type="number" inputMode="decimal" step="0.5" min={0} max={Math.floor(toUnit(10000))}
                  value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0" />
              </Field>
              <Field label={<Text ro="Repetări" en="Reps" />} htmlFor="edit-reps">
                <Input id="edit-reps" big compact type="number" inputMode="numeric" min={0} required
                  value={reps} onChange={(e) => setReps(e.target.value)} placeholder="0" />
              </Field>
              <Field label="RIR" htmlFor="edit-rir">
                <Input id="edit-rir" big compact type="number" inputMode="numeric" min={0} max={5}
                  value={rir} onChange={(e) => setRir(e.target.value)} placeholder="–" />
              </Field>
            </div>
            <Field label={<Text ro="Tip set" en="Set type" />}>
              <Select
                title={t("Tip set", "Set type")}
                value={setType}
                onChange={(value) => setSetType(value as SetType)}
                options={SET_TYPES.map((type) => ({ value: type, label: workoutLabelText(type, t) }))}
              />
            </Field>
            <Button type="submit" variant="secondary" icon={Plus}>
              <Text ro="Adaugă setul nou" en="Add new set" />
            </Button>
          </Card>
        </form>
      ) : (
        <form onSubmit={handleAddCardio}>
          <Card>
            <Field label={<Text ro="Activitate (LISS / HIIT)" en="Activity (LISS / HIIT)" />}>
              <Select
                title={t("Activitate", "Activity")}
                value={cardioActivity}
                onChange={setCardioActivity}
                options={CARDIO_ACTIVITIES.map((act) => ({ value: act, label: cardioName(act, language) }))}
              />
            </Field>
            <Field label={<Text ro="Durată (minute)" en="Duration (minutes)" />} htmlFor="edit-duration">
              <Input id="edit-duration" big type="number" inputMode="numeric" min={1} required
                value={cardioDuration} onChange={(e) => setCardioDuration(e.target.value)} placeholder={t("ex: 30", "e.g. 30")} />
            </Field>
            <Button type="submit" variant="secondary" icon={Plus}>
              <Text ro="Adaugă activitatea" en="Add activity" />
            </Button>
          </Card>
        </form>
      )}

      <h2 className="mt-2 pl-0.5 text-[13px] font-medium text-muted">
        <Text ro="Seturi existente" en="Existing sets" />
      </h2>
      {mode === "strength" ? (
        <SetRows
          rows={sessionSets.map((s, idx) => ({
            key: s.id, ordinal: ordinals[idx], exercise: s.exercise, weightKg: Number(s.weight), reps: s.reps,
            rir: s.rir, setType: s.setType || s.set_type, notes: s.notes,
          }))}
          onRemove={(key) => setSessionSets((prev) => prev.filter((x) => x.id !== key))}
          empty={t("Niciun set.", "No sets.")}
        />
      ) : (
        <CardioRows
          rows={cardioEntries.map((c) => ({ key: c.id, activity: c.activity, durationMin: c.durationMin }))}
          onRemove={(key) => setCardioEntries((prev) => prev.filter((x) => x.id !== key))}
          empty={t("Nicio activitate.", "No activities.")}
        />
      )}

      {error && <Message>{error}</Message>}

      <Button large icon={Save} onClick={handleFinish} busy={isSaving} className="mt-4">
        <Text ro="Salvează modificările" en="Save changes" />
      </Button>
    </Screen>
  )
}
