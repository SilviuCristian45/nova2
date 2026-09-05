import Link from "next/link"
import { ArrowLeft, Plus, History, PieChart, Utensils, ScanBarcode } from "lucide-react"

export default function MealsHubPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col p-5 bg-zinc-950 text-zinc-100">
      
      {/* HEADER */}
      <header className="flex flex-col gap-6 mb-8 mt-2">
        <Link href="/" className="p-2.5 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-xl transition-all border border-transparent hover:border-zinc-800 w-fit">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-500/10 border border-orange-500/20 shadow-inner">
            <Utensils className="size-6 text-orange-500" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Mese & Nutriție</h1>
        </div>
      </header>

      {/* MENIU SECUNDAR (Conform schiței) */}
      <div className="flex flex-col gap-4">
        
        {/* 1. INSERT MEAL */}
        <Link href="/meals/insert" className="group relative flex items-center justify-between p-5 rounded-3xl bg-zinc-900/60 border border-zinc-800/80 hover:bg-zinc-800 hover:border-orange-500/50 transition-all shadow-lg backdrop-blur-sm overflow-hidden">
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl transition-all pointer-events-none"></div>
          <div className="flex items-center gap-4 relative z-10">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-zinc-950 border border-zinc-800 text-zinc-300 shadow-inner">
              <ScanBarcode className="size-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-zinc-100">Adaugă Masă</span>
              <span className="text-xs font-medium text-zinc-400">Caută RAW sau Scanează cod</span>
            </div>
          </div>
          <div className="flex size-8 items-center justify-center rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-500 relative z-10">
            <Plus className="size-4" />
          </div>
        </Link>

        {/* 2. HISTORY */}
        <Link href="/meals/history" className="group relative flex items-center justify-between p-5 rounded-3xl bg-zinc-900/60 border border-zinc-800/80 hover:bg-zinc-800 transition-all shadow-lg backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-zinc-950 border border-zinc-800 text-zinc-300 shadow-inner">
              <History className="size-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-zinc-100">Istoric Mese</span>
              <span className="text-xs font-medium text-zinc-400">Jurnalul tău alimentar</span>
            </div>
          </div>
        </Link>

        {/* 3. PROGRESS / MACROS */}
        <Link href="/meals/progress" className="group relative flex items-center justify-between p-5 rounded-3xl bg-zinc-900/60 border border-zinc-800/80 hover:bg-zinc-800 transition-all shadow-lg backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-zinc-950 border border-zinc-800 text-zinc-300 shadow-inner">
              <PieChart className="size-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-zinc-100">Statistici & Macros</span>
              <span className="text-xs font-medium text-zinc-400">Total Kcal, Proteine, Carbo</span>
            </div>
          </div>
        </Link>

      </div>
    </main>
  )
}