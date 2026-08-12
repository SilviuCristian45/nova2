import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Trophy, ArrowLeft, AlertTriangle } from "lucide-react"

export const dynamic = "force-dynamic"
export const revalidate = 0

// Funcția care calculează 1RM (Formula lui Epley)
function calculate1RM(weight: number, reps: number) {
  if (weight === 0) return 0
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps / 30))
}

export default async function RecordsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Aducem toate seturile utilizatorului pentru a extrage recordurile
  const { data: sets, error } = await supabase
    .from("workout_sets")
    .select("exercise, weight, reps, rir, created_at")
    .eq("user_id", user.id)
    .gt("weight", 0) // Ignorăm seturile cu greutate 0 (ex: bodyweight fără extra greutate)

  if (error) {
    return <div className="p-5 text-red-500 font-bold">Eroare la încărcarea recordurilor: {error.message}</div>
  }

  // Grupăm și calculăm cel mai bun set pentru fiecare exercițiu
  const personalRecords = new Map<string, { weight: number, reps: number, rir: number, date: string, oneRM: number }>()

  sets?.forEach((set) => {
    const current1RM = calculate1RM(set.weight, set.reps)
    const existingPR = personalRecords.get(set.exercise)

    if (!existingPR || current1RM > existingPR.oneRM) {
      personalRecords.set(set.exercise, {
        weight: set.weight,
        reps: set.reps,
        rir: set.rir,
        date: new Date(set.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        oneRM: current1RM
      })
    }
  })

  // Transformăm Map-ul în array și îl sortăm (cele mai grele 1RM primele, pentru efect dramatic)
  const sortedRecords = Array.from(personalRecords.entries())
    .map(([exercise, data]) => ({ exercise, ...data }))
    .sort((a, b) => b.oneRM - a.oneRM)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col p-5 bg-zinc-950 text-zinc-100 pb-10">
      
      {/* HEADER MODERN AURIU */}
      <header className="flex flex-col gap-6 mb-6 mt-2">
        <Link href="/" className="p-2.5 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-xl transition-all border border-transparent hover:border-zinc-800 w-fit">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 shadow-inner">
            <Trophy className="size-6 text-amber-500" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Recorduri Personale</h1>
        </div>
      </header>

      {/* DISCLAIMER PREMIUM */}
      <div className="flex flex-col gap-2 mb-8 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-500 shadow-xl shadow-amber-500/5 backdrop-blur-sm relative overflow-hidden">
        {/* Un glow subtil în fundalul disclaimer-ului */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
        
        <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-xs">
          <AlertTriangle className="size-4 shrink-0" />
          Atenție
        </div>
        <p className="text-amber-500/80 leading-relaxed font-medium">
          <strong>1RM (One Rep Max)</strong> este doar o estimare matematică bazată pe cel mai bun set al tău. Nu încerca niciodată greutatea maximă estimată fără o încălzire completă și progresivă!
        </p>
      </div>

      {sortedRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-500 text-center border border-dashed rounded-3xl border-zinc-800 bg-zinc-900/20">
          <Trophy className="size-10 mb-3 opacity-20 text-amber-500" />
          <p className="text-sm font-medium px-8">Nu ai setat încă niciun record. Înregistrează primul tău antrenament!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {sortedRecords.map((record, index) => {
            // Primele 3 recorduri (cele mai grele ridicări) primesc un tratament special
            const isTop3 = index < 3;

            return (
              <div 
                key={record.exercise} 
                className={`relative flex flex-col rounded-3xl border p-5 shadow-xl backdrop-blur-sm overflow-hidden transition-all ${
                  isTop3 
                    ? "bg-zinc-900/60 border-amber-500/40 shadow-amber-500/5" 
                    : "bg-zinc-900/40 border-zinc-800/80"
                }`}
              >
                {/* Glow subtil pentru Top 3 */}
                {isTop3 && <div className="absolute -right-4 -top-4 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>}

                <div className="flex justify-between items-start mb-4 relative z-10">
                  <h3 className="font-bold text-lg leading-tight text-zinc-100 pr-4">
                    {record.exercise}
                  </h3>
                  {isTop3 && (
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/30 font-black text-xs font-mono">
                      #{index + 1}
                    </div>
                  )}
                </div>
                
                <div className="flex items-end justify-between relative z-10 bg-zinc-950/40 p-4 rounded-2xl border border-zinc-800/50">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Cel mai bun set</span>
                    <span className="text-lg font-bold text-zinc-200">
                      {record.weight} <span className="text-sm text-zinc-500 font-normal">kg ×</span> {record.reps} <span className="text-sm text-zinc-500 font-normal">reps</span>
                    </span>
                    <span className="text-[11px] font-mono text-zinc-500 mt-1 flex items-center gap-1.5">
                      <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 border border-zinc-700">{record.rir} RIR</span> 
                      {record.date}
                    </span>
                  </div>

                  <div className="flex flex-col items-end gap-0.5 text-right">
                    <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Est. 1RM</span>
                    <span className="text-3xl font-black text-amber-400 drop-shadow-sm">
                      {record.oneRM} <span className="text-sm font-bold opacity-70">kg</span>
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