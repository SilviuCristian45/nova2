"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CalendarDays, ChevronRight, Loader2, Utensils, Flame, Wheat, Droplet, Cookie, Search, ChevronLeft } from "lucide-react"
import { createClient } from "@/utils/supabase/client"

const MEAL_LABELS: Record<string, string> = {
  Breakfast: "Mic Dejun",
  Lunch: "Prânz",
  Dinner: "Cină",
  Snack: "Gustare"
}

const ITEMS_PER_PAGE = 5

export default function MealsHistoryPage() {
  const [isLoading, setIsLoading] = useState(true)
  
  const [allHistoryData, setAllHistoryData] = useState<any>({})
  const [displayedDates, setDisplayedDates] = useState<string[]>([])
  
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  async function fetchHistory(isManualFilter = false) {
    setIsLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    let fetchStart = startDate
    let fetchEnd = endDate

    if (!fetchStart || !fetchEnd) {
      const today = new Date()
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(today.getDate() - 30)
      
      fetchEnd = fetchEnd || today.toISOString().split('T')[0]
      fetchStart = fetchStart || thirtyDaysAgo.toISOString().split('T')[0]
    }

    const { data: meals, error } = await supabase
      .from("meals")
      .select(`
        id,
        performed_on,
        meal_type,
        created_at,
        meal_items (
          id,
          consumed_weight_g,
          total_kcal,
          total_protein_g,
          total_carbs_g,
          total_fat_g,
          foods (
            name,
            brand,
            fiber_per_100g
          )
        )
      `)
      .eq("user_id", user.id)
      .gte("performed_on", fetchStart)
      .lte("performed_on", fetchEnd)
      .order("performed_on", { ascending: false })
      .order("created_at", { ascending: true })

    if (error) {
      console.error("Eroare la preluarea istoricului:", error)
      setIsLoading(false)
      return
    }

    const grouped: any = {}

    meals?.forEach((meal: any) => {
      const date = meal.performed_on
      
      // Am adăugat contoare și pentru P, C, G pe întreaga zi
      if (!grouped[date]) {
        grouped[date] = { 
          totalKcal: 0, 
          totalP: 0, 
          totalC: 0, 
          totalF: 0, 
          mealsList: [] 
        }
      }

      const items = (meal.meal_items || []).map((item: any) => {
        const fiber = item.foods?.fiber_per_100g 
          ? (item.foods.fiber_per_100g / 100) * item.consumed_weight_g 
          : 0

        return {
          id: item.id,
          name: item.foods?.name || "Necunoscut",
          brand: item.foods?.brand,
          weight: item.consumed_weight_g,
          kcal: Number(item.total_kcal) || 0,
          protein: Number(item.total_protein_g) || 0,
          carbs: Number(item.total_carbs_g) || 0,
          fat: Number(item.total_fat_g) || 0,
          fiber: Math.round(fiber * 10) / 10
        }
      })

      const mealTotalKcal = items.reduce((sum: number, it: any) => sum + it.kcal, 0)
      const mealTotalProtein = items.reduce((sum: number, it: any) => sum + it.protein, 0)
      const mealTotalCarbs = items.reduce((sum: number, it: any) => sum + it.carbs, 0)
      const mealTotalFat = items.reduce((sum: number, it: any) => sum + it.fat, 0)

      grouped[date].mealsList.push({
        id: meal.id,
        mealType: meal.meal_type,
        createdAt: meal.created_at,
        items,
        totals: {
          kcal: Math.round(mealTotalKcal),
          protein: Math.round(mealTotalProtein * 10) / 10,
          carbs: Math.round(mealTotalCarbs * 10) / 10,
          fat: Math.round(mealTotalFat * 10) / 10
        }
      })

      // Adunăm valorile în totalul zilei
      grouped[date].totalKcal += mealTotalKcal
      grouped[date].totalP += mealTotalProtein
      grouped[date].totalC += mealTotalCarbs
      grouped[date].totalF += mealTotalFat
    })

    setAllHistoryData(grouped)
    
    const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    setTotalPages(Math.ceil(sortedDates.length / ITEMS_PER_PAGE) || 1)
    
    if (isManualFilter) setPage(1)
    
    setIsLoading(false)
  }

  useEffect(() => {
    fetchHistory()
  }, [])

  useEffect(() => {
    const sortedDates = Object.keys(allHistoryData).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    const startIndex = (page - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    setDisplayedDates(sortedDates.slice(startIndex, endIndex))
  }, [page, allHistoryData])

  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
    return new Date(dateString).toLocaleDateString('ro-RO', options)
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col p-5 bg-zinc-950 text-zinc-100">
      
      {/* VEDEREA 1: LISTA ZILELOR + FILTRE */}
      {!selectedDate && (
        <div className="animate-in fade-in slide-in-from-left-4 duration-300 flex flex-col min-h-[90dvh]">
          <header className="flex flex-col gap-6 mb-4 mt-2">
            <Link href="/meals" className="p-2.5 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-xl transition-all w-fit">
              <ArrowLeft className="size-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-500/10 border border-orange-500/20 shadow-inner">
                <CalendarDays className="size-6 text-orange-500" />
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight">Istoric Mese</h1>
            </div>
          </header>

          <div className="flex flex-col gap-3 mb-6 p-4 rounded-3xl bg-zinc-900/60 border border-zinc-800/80">
            <div className="flex items-center gap-2">
              <div className="flex flex-col flex-1 gap-1">
                <label className="text-[10px] text-zinc-500 font-bold uppercase pl-1">De la</label>
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-10 px-3 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-zinc-200 outline-none focus:border-orange-500"
                />
              </div>
              <div className="flex flex-col flex-1 gap-1">
                <label className="text-[10px] text-zinc-500 font-bold uppercase pl-1">Până la</label>
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-10 px-3 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-zinc-200 outline-none focus:border-orange-500"
                />
              </div>
            </div>
            <button 
              onClick={() => fetchHistory(true)}
              className="h-10 w-full bg-zinc-800 text-orange-400 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-700 transition-all text-sm"
            >
              <Search className="size-4" />
              Aplică Filtre
            </button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-20 text-orange-500">
              <Loader2 className="size-8 animate-spin" />
            </div>
          ) : displayedDates.length === 0 ? (
            <div className="text-center py-10 text-zinc-500 font-medium text-sm px-4 bg-zinc-900/30 rounded-2xl border border-dashed border-zinc-800">
              Nu am găsit mese înregistrate pentru perioada selectată.
            </div>
          ) : (
            <div className="flex flex-col gap-3 flex-1">
              {displayedDates.map((date) => (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className="group flex items-center justify-between p-5 rounded-3xl bg-zinc-900/60 border border-zinc-800/80 hover:bg-zinc-800 hover:border-orange-500/50 transition-all text-left shadow-md"
                >
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-bold text-zinc-200 capitalize">{formatDate(date)}</span>
                    
                    {/* NOU: Rândul cu Macros și numărul de mese */}
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="text-xs text-orange-400 font-mono font-bold">
                        {Math.round(allHistoryData[date].totalKcal)} Kcal
                      </span>
                      <span className="text-zinc-700 text-[10px]">|</span>
                      
                      <div className="flex items-center gap-1.5 text-[10px] font-mono">
                        <span className="text-emerald-400 font-bold">{Math.round(allHistoryData[date].totalP)}g P</span>
                        <span className="text-cyan-400 font-bold">{Math.round(allHistoryData[date].totalC)}g C</span>
                        <span className="text-yellow-400 font-bold">{Math.round(allHistoryData[date].totalF)}g G</span>
                      </div>
                      
                      <span className="text-zinc-700 text-[10px]">|</span>
                      <span className="text-[10px] text-zinc-400 font-medium">
                        {allHistoryData[date].mealsList.length} mese
                      </span>
                    </div>

                  </div>
                  <ChevronRight className="size-5 text-zinc-500 group-hover:text-orange-400 transition-colors shrink-0 ml-2" />
                </button>
              ))}
            </div>
          )}

          {/* PAGINARE */}
          {!isLoading && totalPages > 1 && (
            <div className="mt-6 pt-4 border-t border-zinc-800/60 flex items-center justify-between pb-6">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="size-10 flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 disabled:opacity-30 disabled:pointer-events-none transition-all"
              >
                <ChevronLeft className="size-5" />
              </button>
              
              <span className="text-xs font-bold text-zinc-500 font-mono">
                PAGINA {page} DIN {totalPages}
              </span>

              <button 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="size-10 flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 disabled:opacity-30 disabled:pointer-events-none transition-all"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* VEDEREA 2: DETALII ZI */}
      {selectedDate && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
          <header className="flex flex-col gap-6 mb-6 mt-2">
            <div className="flex items-center justify-between">
              <button 
                onClick={() => setSelectedDate(null)}
                className="p-2.5 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-xl transition-all"
              >
                <ArrowLeft className="size-5" />
              </button>
              <h1 className="text-sm font-bold tracking-tight text-zinc-300 capitalize">
                {formatDate(selectedDate)}
              </h1>
              <div className="size-10"></div>
            </div>

            <div className="flex items-center justify-between p-4 border border-orange-500/20 bg-orange-500/10 rounded-2xl shadow-inner">
              <div className="flex flex-col">
                <span className="text-[10px] text-orange-500 font-bold uppercase tracking-widest">Total Zilnic</span>
                <span className="text-2xl font-black text-zinc-100">
                  {Math.round(allHistoryData[selectedDate].totalKcal)} <span className="text-sm text-zinc-400 font-medium">kcal</span>
                </span>
              </div>
              <div className="text-xs font-bold text-zinc-400 font-mono bg-zinc-950/60 px-3 py-1.5 rounded-xl border border-zinc-800">
                {allHistoryData[selectedDate].mealsList.length} Mese
              </div>
            </div>
          </header>

          <div className="flex flex-col gap-5 pb-10">
            {allHistoryData[selectedDate].mealsList.map((meal: any, index: number) => (
              <div key={meal.id} className="flex flex-col gap-3 p-4 rounded-3xl bg-zinc-900/50 border border-zinc-800/80 shadow-md">
                
                <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="size-7 rounded-lg bg-orange-500 text-zinc-950 font-black text-xs flex items-center justify-center shadow-sm">
                      #{index + 1}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-sm font-extrabold text-zinc-100">
                        Masa {index + 1}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-medium">
                        {MEAL_LABELS[meal.mealType] || meal.mealType}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-orange-400 font-bold">{meal.totals.kcal} kcal</span>
                    <span className="text-zinc-600">|</span>
                    <span className="text-emerald-400 font-medium">{meal.totals.protein}g P</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {meal.items.map((item: any) => (
                    <div key={item.id} className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800/50 flex flex-col gap-2">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex flex-col">
                          <span className="font-bold text-xs text-zinc-200 leading-tight">{item.name}</span>
                          {item.brand && item.brand !== "Fără Brand" && (
                            <span className="text-[9px] text-zinc-500 font-mono uppercase">{item.brand}</span>
                          )}
                        </div>
                        <span className="text-[11px] font-bold bg-zinc-800/80 px-2 py-0.5 rounded text-zinc-300 shrink-0 font-mono">
                          {item.weight}g
                        </span>
                      </div>

                      <div className="grid grid-cols-5 gap-1 pt-2 border-t border-zinc-900 text-[10px] font-mono">
                        <div className="flex items-center gap-1 text-zinc-300">
                          <Flame className="size-3 text-orange-500" />
                          <span>{item.kcal}</span>
                        </div>
                        <div className="flex items-center gap-1 text-emerald-400">
                          <span className="font-bold">P:</span>
                          <span>{item.protein}g</span>
                        </div>
                        <div className="flex items-center gap-1 text-cyan-400">
                          <span className="font-bold">C:</span>
                          <span>{item.carbs}g</span>
                        </div>
                        <div className="flex items-center gap-1 text-yellow-400">
                          <span className="font-bold">G:</span>
                          <span>{item.fat}g</span>
                        </div>
                        <div className="flex items-center gap-1 text-purple-400">
                          <Cookie className="size-3" />
                          <span>{item.fiber}g</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </main>
  )
}