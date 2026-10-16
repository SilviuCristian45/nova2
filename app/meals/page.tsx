import { Text } from "@/app/components/language-provider"
import Link from "next/link"
import { ArrowLeft, Plus, History, PieChart, Utensils, ScanBarcode } from "lucide-react"

export default function MealsHubPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col p-5 lg:px-8 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      
      {/* HEADER */}
      <header className="flex flex-col gap-6 mb-8 mt-2">
        <Link href="/" className="p-2.5 -ml-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-xl transition-all border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 w-fit">
          <ArrowLeft className="size-5" />
        <span className="sr-only"><Text ro="Înapoi" en="Back" /></span></Link>
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-500/10 border border-orange-500/20 shadow-inner">
            <Utensils className="size-6 text-orange-700 dark:text-orange-500" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight"><Text ro="Mese & Nutriție" en="Meals & Nutrition" /></h1>
        </div>
      </header>

      {/* MENIU SECUNDAR (Conform schiței) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        
        {/* 1. INSERT MEAL */}
        <Link href="/meals/insert" className="group relative flex items-center justify-between p-5 rounded-3xl bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:border-orange-500/50 transition-all shadow-lg backdrop-blur-sm overflow-hidden">
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl transition-all pointer-events-none"></div>
          <div className="flex items-center gap-4 relative z-10">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 shadow-inner">
              <ScanBarcode className="size-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100"><Text ro="Adaugă Masă" en="Add meal" /></span>
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400"><Text ro="Caută RAW sau Scanează cod" en="Search foods or scan a barcode" /></span>
            </div>
          </div>
          <div className="flex size-8 items-center justify-center rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-700 dark:text-orange-500 relative z-10">
            <Plus className="size-4" />
          </div>
        </Link>

        {/* 2. HISTORY */}
        <Link href="/meals/history" className="group relative flex items-center justify-between p-5 rounded-3xl bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all shadow-lg backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 shadow-inner">
              <History className="size-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100"><Text ro="Istoric Mese" en="Meal history" /></span>
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400"><Text ro="Jurnalul tău alimentar" en="Your food diary" /></span>
            </div>
          </div>
        </Link>

        {/* 3. PROGRESS / MACROS */}
        <Link href="/meals/progress" className="group relative flex items-center justify-between p-5 rounded-3xl bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all shadow-lg backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 shadow-inner">
              <PieChart className="size-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100"><Text ro="Statistici & Macros" en="Statistics & Macros" /></span>
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400"><Text ro="Total Kcal, Proteine, Carbo" en="Calories, protein and carbs" /></span>
            </div>
          </div>
        </Link>

      </div>
    </main>
  )
}