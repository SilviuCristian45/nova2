"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ChevronLeft, ChevronRight, Flame, Activity, Plus, Settings } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { getUserTargets } from "@/app/meals/action"

export default function ProgressDashboardPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [isLoading, setIsLoading] = useState(true)
  
  const [totals, setTotals] = useState({ kcal: 0, p: 0, c: 0, f: 0, fiber: 0 })
  const [goals, setGoals] = useState({ kcal: 2200, protein: 160, carbs: 250, fat: 70, fiber: 30 })

  const dateString = currentDate.toISOString().split('T')[0]

  useEffect(() => {
    async function fetchDashboardData() {
      setIsLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Tragem paralalel atât Mesele de azi, cât și Targeturile Userului
      const [mealsRes, targetsRes] = await Promise.all([
        supabase
          .from("meals")
          .select(`
            meal_items (
              consumed_weight_g,
              total_kcal,
              total_protein_g,
              total_carbs_g,
              total_fat_g,
              foods ( fiber_per_100g )
            )
          `)
          .eq("user_id", user.id)
          .eq("performed_on", dateString),
        getUserTargets()
      ])

      // Actualizăm Targeturile
      if (targetsRes.targets) setGoals(targetsRes.targets)

      // Calculăm ce a mâncat azi (inclusiv fibre calculate pe gramaj)
      let dayKcal = 0, dayP = 0, dayC = 0, dayF = 0, dayFiber = 0

      mealsRes.data?.forEach(meal => {
        meal.meal_items.forEach((item: any) => {
          dayKcal += item.total_kcal || 0
          dayP += item.total_protein_g || 0
          dayC += item.total_carbs_g || 0
          dayF += item.total_fat_g || 0
          
          if (item.foods?.fiber_per_100g) {
            dayFiber += (item.foods.fiber_per_100g / 100) * item.consumed_weight_g
          }
        })
      })

      setTotals({
        kcal: Math.round(dayKcal),
        p: Math.round(dayP * 10) / 10,
        c: Math.round(dayC * 10) / 10,
        f: Math.round(dayF * 10) / 10,
        fiber: Math.round(dayFiber * 10) / 10
      })
      
      setIsLoading(false)
    }

    fetchDashboardData()
  }, [dateString])

  const changeDate = (days: number) => {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() + days)
    setCurrentDate(newDate)
  }

  const getDisplayDate = () => {
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    if (dateString === today) return "Astăzi"
    if (dateString === yesterday) return "Ieri"
    return currentDate.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })
  }

  const kcalPercent = Math.min((totals.kcal / (goals.kcal || 1)) * 100, 100)
  const circleRadius = 75
  const circleCircumference = 2 * Math.PI * circleRadius
  const circleOffset = circleCircumference - (kcalPercent / 100) * circleCircumference

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col p-5 bg-zinc-950 text-zinc-100 pb-20">
      
      <header className="flex items-center justify-between mb-8 mt-2">
        <Link href="/meals" className="p-2.5 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-xl transition-all">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-4 bg-zinc-900/60 px-2 py-1.5 rounded-2xl border border-zinc-800/80">
          <button onClick={() => changeDate(-1)} className="p-1.5 text-zinc-400 hover:text-orange-400 transition-colors">
            <ChevronLeft className="size-5" />
          </button>
          <span className="font-bold text-sm min-w-[80px] text-center text-zinc-200">
            {getDisplayDate()}
          </span>
          <button onClick={() => changeDate(1)} className="p-1.5 text-zinc-400 hover:text-orange-400 transition-colors" disabled={dateString === new Date().toISOString().split('T')[0]}>
            <ChevronRight className="size-5" />
          </button>
        </div>
        <div className="size-10"></div>
      </header>

      {/* INEL SVG CALORII */}
      <div className="flex flex-col items-center justify-center mb-10 relative">
        <div className="relative flex items-center justify-center">
          <svg className="transform -rotate-90 size-56" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r={circleRadius} stroke="currentColor" strokeWidth="12" fill="transparent" className="text-zinc-900" />
            <circle
              cx="100" cy="100" r={circleRadius} stroke="currentColor" strokeWidth="12" fill="transparent"
              strokeDasharray={circleCircumference}
              strokeDashoffset={isLoading ? circleCircumference : circleOffset}
              strokeLinecap="round"
              className={`text-orange-500 transition-all duration-1000 ease-out ${isLoading ? 'opacity-0' : 'opacity-100'}`}
            />
          </svg>
          
          <div className="absolute flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
            <Flame className="size-6 text-orange-500 mb-1 opacity-80" />
            <span className="text-4xl font-black tracking-tighter text-zinc-100">
              {totals.kcal}
            </span>
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-1">
              / {goals.kcal} KCAL
            </span>
            <span className={`text-[10px] font-bold mt-2 px-2 py-0.5 rounded-full ${totals.kcal > goals.kcal ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
              {totals.kcal > goals.kcal ? `+${totals.kcal - goals.kcal} peste target` : `${goals.kcal - totals.kcal} rămase`}
            </span>
          </div>
        </div>
      </div>

      {/* BARE MACRONUTRIENȚI & BUTON EDITARE */}
      <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-6 fade-in duration-700">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-zinc-400 flex items-center gap-2">
            <Activity className="size-4" /> Macronutrienți
          </h2>
          <Link 
            href="/meals/progress/targets"
            className="flex items-center gap-1.5 text-xs font-bold text-orange-500 bg-orange-500/10 px-3 py-1.5 rounded-lg hover:bg-orange-500/20 transition-all border border-orange-500/20"
          >
            <Settings className="size-3.5" /> Editează Obiective
          </Link>
        </div>

        {/* PROTEINE */}
        <div className="flex flex-col gap-2 p-4 rounded-3xl bg-zinc-900/50 border border-zinc-800/60 shadow-sm">
          <div className="flex justify-between items-center text-sm">
            <span className="font-bold text-zinc-200">Proteine</span>
            <div className="font-mono text-xs">
              <span className="text-emerald-400 font-bold">{totals.p}g</span><span className="text-zinc-600 mx-1">/</span><span className="text-zinc-500">{goals.protein}g</span>
            </div>
          </div>
          <div className="h-2.5 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.min((totals.p / (goals.protein || 1)) * 100, 100)}%` }} />
          </div>
        </div>

        {/* CARBO */}
        <div className="flex flex-col gap-2 p-4 rounded-3xl bg-zinc-900/50 border border-zinc-800/60 shadow-sm">
          <div className="flex justify-between items-center text-sm">
            <span className="font-bold text-zinc-200">Carbohidrați</span>
            <div className="font-mono text-xs">
              <span className="text-cyan-400 font-bold">{totals.c}g</span><span className="text-zinc-600 mx-1">/</span><span className="text-zinc-500">{goals.carbs}g</span>
            </div>
          </div>
          <div className="h-2.5 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
            <div className="h-full bg-cyan-500 rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.min((totals.c / (goals.carbs || 1)) * 100, 100)}%` }} />
          </div>
        </div>

        {/* GRĂSIMI */}
        <div className="flex flex-col gap-2 p-4 rounded-3xl bg-zinc-900/50 border border-zinc-800/60 shadow-sm">
          <div className="flex justify-between items-center text-sm">
            <span className="font-bold text-zinc-200">Grăsimi</span>
            <div className="font-mono text-xs">
              <span className="text-yellow-400 font-bold">{totals.f}g</span><span className="text-zinc-600 mx-1">/</span><span className="text-zinc-500">{goals.fat}g</span>
            </div>
          </div>
          <div className="h-2.5 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
            <div className="h-full bg-yellow-500 rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.min((totals.f / (goals.fat || 1)) * 100, 100)}%` }} />
          </div>
        </div>

        {/* FIBRE (Adăugat special!) */}
        <div className="flex flex-col gap-2 p-4 rounded-3xl bg-zinc-900/50 border border-zinc-800/60 shadow-sm">
          <div className="flex justify-between items-center text-sm">
            <span className="font-bold text-zinc-200">Fibre</span>
            <div className="font-mono text-xs">
              <span className="text-purple-400 font-bold">{totals.fiber}g</span><span className="text-zinc-600 mx-1">/</span><span className="text-zinc-500">{goals.fiber}g</span>
            </div>
          </div>
          <div className="h-2.5 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
            <div className="h-full bg-purple-500 rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.min((totals.fiber / (goals.fiber || 1)) * 100, 100)}%` }} />
          </div>
        </div>

      </div>

      <Link 
        href="/meals/insert"
        className="fixed bottom-6 right-6 size-14 bg-orange-500 hover:bg-orange-400 text-zinc-950 rounded-full flex items-center justify-center shadow-lg shadow-orange-500/20 transition-all active:scale-90 z-50"
      >
        <Plus className="size-6 stroke-[3]" />
      </Link>
    </main>
  )
}