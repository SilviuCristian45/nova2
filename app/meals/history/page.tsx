"use client"

import { Text, useLanguage } from "@/app/components/language-provider"
import { FoodLabel } from "@/app/components/food-label"
import { useEffect, useState } from "react"
import { ArrowLeft, ChevronRight, Loader2, Utensils, Search, ChevronLeft } from "lucide-react"
import { Badge, BigNumber, Button, Card, Columns, Empty, Field, IconButton, Input, Label, Screen, pageWidth } from "@/app/components/ui"
import { createClient } from "@/utils/supabase/client"

const MEAL_LABELS: Record<string, string> = {
  Breakfast: "Mic Dejun",
  Lunch: "Prânz",
  Dinner: "Cină",
  Snack: "Gustare"
}

const ITEMS_PER_PAGE = 5

export default function MealsHistoryPage() {
  const { t, locale } = useLanguage()

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
          name: item.foods?.name || "",
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
    return new Date(dateString).toLocaleDateString(locale, options)
  }

  // Day list, or the details of one day.
  if (selectedDate) {
    const day = allHistoryData[selectedDate]
    return (
      <main className={`${pageWidth} flex flex-col gap-4 p-5 pb-12 text-foreground lg:gap-5 lg:px-8`}>
        <header className="mb-2 flex items-center gap-1.5">
          <IconButton plain icon={ArrowLeft} label={t("Înapoi", "Back")} onClick={() => setSelectedDate(null)} className="-ml-2.5" />
          <h1 className="min-w-0 flex-1 text-[28px] font-bold capitalize leading-tight tracking-[-0.8px]">{formatDate(selectedDate)}</h1>
        </header>

        <Card>
          <Label><Text ro="Total zilnic" en="Daily total" /></Label>
          <BigNumber value={Math.round(day.totalKcal).toLocaleString(locale)} unit="kcal" />
          <MacroLine p={day.totalP} c={day.totalC} f={day.totalF} />
          <p className="text-[13px] text-muted">{day.mealsList.length} <Text ro="mese" en="meals" /></p>
        </Card>

        <Columns three>
        {day.mealsList.map((meal: any, index: number) => (
          <Card key={meal.id} padded={false}>
            <div className="flex items-center justify-between gap-3 px-[18px] pt-4 pb-3">
              <div className="flex min-w-0 flex-col">
                <span className="text-[17px] font-semibold"><Text ro="Masa" en="Meal" /> {index + 1}</span>
                <span className="text-[13px] text-muted">{MEAL_LABELS[meal.mealType] ? t(MEAL_LABELS[meal.mealType], meal.mealType) : meal.mealType}</span>
              </div>
              <span className="text-right tabular-nums">
                <span className="text-[17px] font-semibold">{meal.totals.kcal}</span> <span className="text-[13px] text-muted">kcal</span>
              </span>
            </div>
            {meal.items.map((item: any) => (
              <div key={item.id} className="flex flex-col gap-1.5 border-t border-line px-[18px] py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="break-words font-medium leading-tight"><FoodLabel value={item.name || t("Necunoscut", "Unknown")} /></span>
                    {item.brand && item.brand !== "Fără Brand" && (
                      <span className="text-xs text-muted">{item.brand === "Creat Manual" ? t("Creat manual", "Custom food") : item.brand}</span>
                    )}
                  </div>
                  <Badge className="shrink-0 tabular-nums">{item.weight} g</Badge>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] tabular-nums">
                  <span><span className="font-semibold">{item.kcal}</span> <span className="text-muted">kcal</span></span>
                  <span className="text-lime-text">P {item.protein}g</span>
                  <span className="text-ice-text">C {item.carbs}g</span>
                  <span className="text-gold-text">{t("G", "F")} {item.fat}g</span>
                  <span className="text-lilac-text">{t("Fibre", "Fibre")} {item.fiber}g</span>
                </div>
              </div>
            ))}
          </Card>
        ))}
        </Columns>
      </main>
    )
  }

  return (
    <Screen title={<Text ro="Istoric mese" en="Meal history" />} back="/meals">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-5">
      <Card>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label={<Text ro="De la" en="From" />} htmlFor="meals-from">
            <Input id="meals-from" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label={<Text ro="Până la" en="To" />} htmlFor="meals-to">
            <Input id="meals-to" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <Button variant="secondary" icon={Search} onClick={() => fetchHistory(true)}>
          <Text ro="Aplică filtrele" en="Apply filters" />
        </Button>
      </Card>

      <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
      {isLoading ? (
        <div role="status" className="flex justify-center py-20 text-lime-text">
          <Loader2 className="size-8 animate-spin" />
          <span className="sr-only">{t("Se încarcă...", "Loading...")}</span>
        </div>
      ) : displayedDates.length === 0 ? (
        <Empty icon={Utensils}><Text ro="Nu am găsit mese înregistrate pentru perioada selectată." en="No meals found for the selected period." /></Empty>
      ) : (
        <Card padded={false}>
          {displayedDates.map((date, index) => (
            <button key={date} type="button" onClick={() => setSelectedDate(date)}
              className={`flex w-full items-center gap-3 px-[18px] py-4 text-left transition-colors active:bg-inner ${index > 0 ? "border-t border-line" : ""}`}>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[17px] font-medium capitalize">{formatDate(date)}</span>
                <span className="text-[13px] text-muted tabular-nums">
                  <span className="font-semibold text-foreground">{Math.round(allHistoryData[date].totalKcal)}</span> kcal · {allHistoryData[date].mealsList.length} <Text ro="mese" en="meals" />
                </span>
                <MacroLine p={allHistoryData[date].totalP} c={allHistoryData[date].totalC} f={allHistoryData[date].totalF} />
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted" />
            </button>
          ))}
        </Card>
      )}

      {!isLoading && totalPages > 1 && (
        <nav aria-label={t("Paginare", "Pagination")} className="mt-2 flex items-center justify-between gap-2">
          <IconButton icon={ChevronLeft} label={t("Înapoi", "Previous")} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} />
          <span className="text-sm text-muted tabular-nums"><Text ro="Pagina" en="Page" /> {page} <Text ro="din" en="of" /> {totalPages}</span>
          <IconButton icon={ChevronRight} label={t("Înainte", "Next")} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} />
        </nav>
      )}
      </div>
      </div>
    </Screen>
  )
}

// Protein / carbs / fat of a day, coloured like the macro bars.
function MacroLine({ p, c, f }: { p: number; c: number; f: number }) {
  const { t } = useLanguage()
  return (
    <span className="flex flex-wrap gap-x-3 text-[13px] font-medium tabular-nums">
      <span className="text-lime-text">{Math.round(p)}g P</span>
      <span className="text-ice-text">{Math.round(c)}g C</span>
      <span className="text-gold-text">{Math.round(f)}g {t("G", "F")}</span>
    </span>
  )
}
