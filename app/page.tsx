import Link from "next/link"
import { redirect } from "next/navigation"
import { Dumbbell, History, LineChart, LogOut, Trophy } from "lucide-react"
import { createClient } from "@/lib/supabase/server"

export default async function Home() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col p-5 bg-background">
      <header className="mb-8 mt-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Salut!</h1>
        <p className="text-muted-foreground mt-2">Ce facem astăzi la antrenament?</p>
      </header>

      {/* Am adăugat grid sau flex cu 3 opțiuni */}
      <div className="flex flex-col gap-4 flex-1">
        <Link 
          href="/insert"
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-primary bg-primary/5 p-6 transition-colors hover:bg-primary/10"
        >
          <Dumbbell className="size-8 text-primary" />
          <span className="text-lg font-semibold">Insert Workout</span>
        </Link>

        <Link 
          href="/history"
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-6 transition-colors hover:bg-secondary/50 shadow-sm"
        >
          <History className="size-8 text-foreground" />
          <span className="text-lg font-semibold">View History</span>
        </Link>

        <Link 
          href="/stats"
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-6 transition-colors hover:bg-secondary/50 shadow-sm"
        >
          <LineChart className="size-8 text-emerald-500" />
          <span className="text-lg font-semibold">Progresie & Grafice</span>
        </Link>

		<Link 
  href="/records" 
  className="flex items-center justify-center gap-2 rounded-xl bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 p-4 font-semibold border border-yellow-500/20 hover:bg-yellow-500/20 transition-colors"
>
  <Trophy className="size-5" />
  Vezi Recorduri Personale
</Link>
      </div>

      <form 
        action={async () => {
          "use server"
          const sup = await createClient()
          await sup.auth.signOut()
          redirect("/login")
        }} 
        className="mt-auto pt-10 pb-4 flex justify-center"
      >
        <button type="submit" className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-red-500 transition-colors">
          <LogOut className="size-4" /> Deconectare
        </button>
      </form>
    </main>
  )
}