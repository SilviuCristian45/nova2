import { Text } from "@/app/components/language-provider"
import { getLanguage } from "@/app/language"
import { ExerciseName } from "@/app/components/exercise-name"
import { getWeightUnit } from "@/app/units"
import { kgToUnit } from "@/lib/units"
import { recordsByExercise, type RecordRow } from "@/lib/personal-record"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Trophy, ArrowLeft, AlertTriangle } from "lucide-react"

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
      return <div className="p-5 text-red-700 dark:text-red-500 font-bold"><Text ro="Eroare la încărcarea recordurilor:" en="Could not load records:" /> {error.message}</div>
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
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col p-5 lg:px-8 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 pb-10">
      
      {/* HEADER MODERN AURIU */}
      <header className="flex flex-col gap-6 mb-6 mt-2">
        <Link href="/" className="p-2.5 -ml-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-xl transition-all border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 w-fit">
          <ArrowLeft className="size-5" />
        <span className="sr-only"><Text ro="Înapoi" en="Back" /></span></Link>
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 shadow-inner">
            <Trophy className="size-6 text-amber-700 dark:text-amber-500" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight"><Text ro="Recorduri Personale" en="Personal Records" /></h1>
        </div>
      </header>

      {/* DISCLAIMER PREMIUM */}
      <div className="flex flex-col gap-2 mb-8 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-500 shadow-xl shadow-amber-500/5 backdrop-blur-sm relative overflow-hidden">
        {/* Un glow subtil în fundalul disclaimer-ului */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
        
        <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-xs">
          <AlertTriangle className="size-4 shrink-0" />
          <Text ro="Atenție" en="Caution" />
        </div>
        <p className="text-amber-700/80 dark:text-amber-500/80 leading-relaxed font-medium">
          <strong><Text ro="1RM (O repetare maximă)" en="1RM (One Rep Max)" /></strong> <Text ro="este doar o estimare matematică bazată pe cel mai bun set al tău. Nu încerca niciodată greutatea maximă estimată fără o încălzire completă și progresivă!" en="is only a mathematical estimate based on your best set. Never attempt the estimated maximum weight without a full, progressive warmup!" />
        </p>
      </div>

      {sortedRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-500 text-center border border-dashed rounded-3xl border-zinc-200 dark:border-zinc-800 bg-zinc-100/20 dark:bg-zinc-900/20">
          <Trophy className="size-10 mb-3 opacity-20 text-amber-700 dark:text-amber-500" />
          <p className="text-sm font-medium px-8"><Text ro="Nu ai setat încă niciun record. Înregistrează primul tău antrenament!" en="You have no records yet. Log your first workout!" /></p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {sortedRecords.map((record, index) => {
            // Primele 3 recorduri (cele mai grele ridicări) primesc un tratament special
            const isTop3 = index < 3;

            return (
              <div 
                key={record.exercise} 
                className={`relative flex flex-col rounded-3xl border p-5 shadow-xl backdrop-blur-sm overflow-hidden transition-all ${
                  isTop3 
                    ? "bg-zinc-100 dark:bg-zinc-900/60 border-amber-500/40 shadow-amber-500/5"
                    : "bg-zinc-100 dark:bg-zinc-900/40 border-zinc-200/80 dark:border-zinc-800/80"
                }`}
              >
                {/* Glow subtil pentru Top 3 */}
                {isTop3 && <div className="absolute -right-4 -top-4 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>}

                <div className="flex justify-between items-start mb-4 relative z-10">
                  <h3 className="font-bold text-lg leading-tight text-zinc-900 dark:text-zinc-100 pr-4">
                    <ExerciseName id={record.exercise} />
                  </h3>
                  {isTop3 && (
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-500 border border-amber-500/30 font-black text-xs font-mono">
                      #{index + 1}
                    </div>
                  )}
                </div>
                
                <div className="flex items-end justify-between relative z-10 bg-white dark:bg-zinc-950/40 p-4 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest"><Text ro="Cel mai bun set" en="Best set" /></span>
                    <span className="text-lg font-bold text-zinc-800 dark:text-zinc-200">
                      {kgToUnit(Number(record.weight), unit).toLocaleString(locale)} <span className="text-sm text-zinc-500 font-normal">{unit} ×</span> {record.reps} <span className="text-sm text-zinc-500 font-normal"><Text ro="repetări" en="reps" /></span>
                    </span>
                    <span className="text-[11px] font-mono text-zinc-500 mt-1 flex items-center gap-1.5">
                      <span className="bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700">{record.rir} RIR</span>
                      {record.date}
                    </span>
                  </div>

                  <div className="flex flex-col items-end gap-0.5 text-right">
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest"><Text ro="1RM estimat" en="Est. 1RM" /></span>
                    <span className="text-3xl font-black text-amber-700 dark:text-amber-400 drop-shadow-sm">
                      {kgToUnit(record.oneRM, unit).toLocaleString(locale)} <span className="text-sm font-bold opacity-70">{unit}</span>
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

    </main>
  )
}