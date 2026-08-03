import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Trophy, ArrowLeft, AlertTriangle } from "lucide-react"

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
    return <div className="p-5 text-red-500">Eroare la încărcarea recordurilor: {error.message}</div>
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
        date: new Date(set.created_at).toLocaleDateString("ro-RO"),
        oneRM: current1RM
      })
    }
  })

  // Transformăm Map-ul în array și îl sortăm alfabetic după numele exercițiului
  const sortedRecords = Array.from(personalRecords.entries())
    .map(([exercise, data]) => ({ exercise, ...data }))
    .sort((a, b) => a.exercise.localeCompare(b.exercise))

  return (
    <main className="flex min-h-dvh flex-col items-center p-5 bg-background">
      <div className="w-full max-w-2xl flex flex-col gap-6 mt-4">
        
        <header className="flex flex-col gap-4">
          <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-2 w-fit">
            <ArrowLeft className="size-4" /> Înapoi la Istoric
          </Link>
          <div className="flex items-center gap-2">
            <Trophy className="size-7 text-yellow-500" />
            <h1 className="text-3xl font-bold tracking-tight">Recorduri Personale</h1>
          </div>
        </header>

        {/* Disclaimer Warning */}
        <div className="flex items-start gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-600 dark:text-yellow-400">
          <AlertTriangle className="size-5 shrink-0 mt-0.5" />
          <p>
            <strong>Atenție:</strong> 1 Rep Max (1RM) este doar o estimare matematică bazată pe cel mai bun set al tău. 
            Nu încerca niciodată greutatea maximă estimată fără o <strong>încălzire completă și progresivă</strong> înainte!
          </p>
        </div>

        {sortedRecords.length === 0 ? (
          <div className="text-center p-10 border rounded-xl border-dashed">
            <p className="text-muted-foreground">Nu ai setat încă niciun record. Trage tare la sală!</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {sortedRecords.map((record) => (
              <div key={record.exercise} className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
                <h3 className="font-semibold text-lg mb-4 truncate" title={record.exercise}>
                  {record.exercise}
                </h3>
                
                <div className="flex items-end justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cel mai bun set</span>
                    <span className="text-lg font-bold">
                      {record.weight}kg &times; {record.reps}
                    </span>
                    <span className="text-xs text-muted-foreground">RIR: {record.rir} • Data: {record.date}</span>
                  </div>

                  <div className="flex flex-col items-end gap-1 text-right">
                    <span className="text-xs font-medium text-emerald-500 uppercase tracking-wider">Est. 1RM</span>
                    <span className="text-2xl font-black text-emerald-500">
                      {record.oneRM} <span className="text-base font-bold">kg</span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </main>
  )
}