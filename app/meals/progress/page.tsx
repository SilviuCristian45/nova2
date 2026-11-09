"use client"

import { Text, useLanguage } from "@/app/components/language-provider"
import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { Card, IconButton, Label, ProgressBar, Screen, TextLink, type Tone } from "@/app/components/ui"
import { createClient } from "@/utils/supabase/client"
import { getUserTargets } from "@/app/meals/action"

export default function ProgressDashboardPage() {
  const { t, locale } = useLanguage()

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
    if (dateString === today) return t("Astăzi", "Today")
    if (dateString === yesterday) return t("Ieri", "Yesterday")
    return currentDate.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  }

  const kcalPercent = Math.min((totals.kcal / (goals.kcal || 1)) * 100, 100)
  const over = totals.kcal > goals.kcal
  const circleRadius = 75
  const circleCircumference = 2 * Math.PI * circleRadius
  const circleOffset = circleCircumference - (kcalPercent / 100) * circleCircumference
  const isToday = dateString === new Date().toISOString().split('T')[0]

  const macro = (label: string, value: number, goal: number, tone: Tone, text: string) => (
    <div key={label} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{label}</span>
        <span className="text-[13px] text-muted tabular-nums">
          <span className={`text-[15px] font-semibold ${text}`}>{value}</span> / {goal} g
        </span>
      </div>
      <ProgressBar value={(value / (goal || 1)) * 100} tone={tone} />
    </div>
  )

  return (
    <Screen title={<Text ro="Statistici" en="Statistics" />} back="/meals" className="pb-28">
      <div className="flex items-center justify-between rounded-full bg-card p-1">
        <IconButton plain icon={ChevronLeft} label={t("Ziua anterioară", "Previous day")} onClick={() => changeDate(-1)} />
        <span className="text-base font-semibold">{getDisplayDate()}</span>
        <IconButton plain icon={ChevronRight} label={t("Ziua următoare", "Next day")} onClick={() => changeDate(1)} disabled={isToday} />
      </div>

      <Card className="items-center py-6">
        <div className="relative flex items-center justify-center">
          <svg className="size-56 -rotate-90" viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r={circleRadius} stroke="var(--inner)" strokeWidth="14" fill="transparent" />
            <circle
              cx="100" cy="100" r={circleRadius} stroke={over ? "var(--red)" : "var(--lime)"} strokeWidth="14" fill="transparent"
              strokeDasharray={circleCircumference}
              strokeDashoffset={isLoading ? circleCircumference : circleOffset}
              strokeLinecap="round"
              className={`transition-all duration-1000 ease-out ${isLoading ? "opacity-0" : "opacity-100"}`}
            />
          </svg>
          <div className="absolute flex flex-col items-center gap-0.5">
            <span className="text-[44px] font-bold leading-none tracking-[-1.5px] tabular-nums">{totals.kcal.toLocaleString(locale)}</span>
            <span className="text-sm text-muted tabular-nums">/ {goals.kcal.toLocaleString(locale)} kcal</span>
          </div>
        </div>
        <p className={`font-semibold tabular-nums ${over ? "text-red-text" : "text-soft"}`}>
          {over
            ? `${totals.kcal - goals.kcal} ${t("kcal peste obiectiv", "kcal over goal")}`
            : `${goals.kcal - totals.kcal} ${t("kcal rămase", "kcal remaining")}`}
        </p>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <Label><Text ro="Macronutrienți" en="Macronutrients" /></Label>
          <TextLink href="/meals/progress/targets">{t("Obiective", "Goals")}</TextLink>
        </div>
        {macro(t("Proteine", "Protein"), totals.p, goals.protein, "lime", "text-lime-text")}
        {macro(t("Carbohidrați", "Carbohydrates"), totals.c, goals.carbs, "ice", "text-ice-text")}
        {macro(t("Grăsimi", "Fat"), totals.f, goals.fat, "gold", "text-gold-text")}
        {macro(t("Fibre", "Fibre"), totals.fiber, goals.fiber, "lilac", "text-lilac-text")}
      </Card>

      <Link
        href="/meals/insert"
        className="fixed bottom-7 right-5 z-50 flex size-[60px] items-center justify-center rounded-full bg-lime text-on-solid shadow-lg transition-transform active:scale-95"
      >
        <Plus className="size-[26px]" strokeWidth={2.5} />
        <span className="sr-only"><Text ro="Adaugă masă" en="Add meal" /></span>
      </Link>
    </Screen>
  )
}
