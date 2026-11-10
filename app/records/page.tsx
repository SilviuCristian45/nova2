import { Text } from "@/app/components/language-provider"
import { getLanguage } from "@/app/language"
import { ExerciseName } from "@/app/components/exercise-name"
import { getWeightUnit } from "@/app/units"
import { kgToUnit } from "@/lib/units"
import { recordsByExercise, type RecordRow } from "@/lib/personal-record"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Trophy } from "lucide-react"
import { Card, Columns, Empty, Message, Screen } from "@/app/components/ui"

export const dynamic = "force-dynamic"
export const revalidate = 0


export default async function RecordsPage() {
  const { locale } = await getLanguage()
  const unit = await getWeightUnit()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Aducem toate seturile utilizatorului (Supabase întoarce max 1000 de rânduri pe cerere: paginăm)
  const PAGE_SIZE = 1000
  const sets: RecordRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("workout_sets")
      .select("id, exercise, weight, reps, rir, set_type, workouts!inner(performed_on)")
      .eq("user_id", user.id)
      .gt("weight", 0) // Ignorăm seturile cu greutate 0 (ex: bodyweight fără extra greutate)
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      return <Screen title={<Text ro="Recorduri personale" en="Personal records" />}><Message><Text ro="Eroare la încărcarea recordurilor:" en="Could not load records:" /> {error.message}</Message></Screen>
    }
    for (const row of data ?? []) {
      const parent = Array.isArray(row.workouts) ? row.workouts[0] : row.workouts
      sets.push({ ...row, performed_on: parent.performed_on })
    }
    if (!data || data.length < PAGE_SIZE) break
  }

  // Cel mai bun set pe exercițiu (fără Warmup), cu data antrenamentului, nu a inserării
  const sortedRecords = recordsByExercise(sets).map((record) => {
    const [y, m, d] = record.performedOn.split("-").map(Number)
    return {
      ...record,
      date: new Date(y, m - 1, d).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" }),
    }
  })

  return (
    <Screen title={<Text ro="Recorduri personale" en="Personal records" />}>
      {sortedRecords.length === 0 ? (
        <Empty icon={Trophy}><Text ro="Nu ai setat încă niciun record. Înregistrează primul tău antrenament!" en="You have no records yet. Log your first workout!" /></Empty>
      ) : (
        <Columns three>
        {sortedRecords.map((record, index) => (
          <Card key={record.exercise}>
            <div className="flex items-start justify-between gap-2.5">
              <h2 className="min-w-0 flex-1 break-words text-[17px] font-medium"><ExerciseName id={record.exercise} /></h2>
              {index < 3 && (
                <span className={`flex h-[30px] min-w-[30px] shrink-0 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums ${index === 0 ? "bg-lime text-on-solid" : "bg-control text-soft"}`}>
                  {index + 1}
                </span>
              )}
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[13px] font-medium text-muted"><Text ro="Cel mai bun set" en="Best set" /></span>
                <span className="text-[20px] font-semibold tabular-nums">
                  {kgToUnit(Number(record.weight), unit).toLocaleString(locale)} <span className="text-sm font-normal text-muted">{unit} ×</span> {record.reps}
                </span>
                <span className="text-xs text-muted tabular-nums">{record.rir === null ? "–" : `${record.rir} RIR`} · {record.date}</span>
              </div>
              <div className="flex flex-col items-end gap-0.5 text-right">
                <span className="text-[13px] font-medium text-muted"><Text ro="1RM estimat" en="Est. 1RM" /></span>
                <span className="text-[32px] font-bold leading-none tracking-[-1px] text-lime-text tabular-nums">
                  {kgToUnit(record.oneRM, unit).toLocaleString(locale)} <span className="text-sm font-normal text-muted">{unit}</span>
                </span>
              </div>
            </div>
          </Card>
        ))}
        </Columns>
      )}
      {sortedRecords.length > 0 && (
        <p className="px-1 text-xs leading-[17px] text-muted">
          <Text ro="1RM (o repetare maximă) este doar o estimare matematică bazată pe cel mai bun set al tău. Nu încerca niciodată greutatea maximă estimată fără o încălzire completă și progresivă!" en="1RM (one rep max) is only a mathematical estimate based on your best set. Never attempt the estimated maximum weight without a full, progressive warmup!" />
        </p>
      )}
    </Screen>
  )
}
