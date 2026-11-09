"use client"

import { Text, useLanguage } from "@/app/components/language-provider"
import { FoodLabel } from "@/app/components/food-label"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { Search, Loader2, Plus, ScanBarcode, Trash2, Save, X } from "lucide-react"
import confetti from "canvas-confetti"
import { saveCompleteMeal, saveMealTemplate, getUserTemplates } from "../action"
import { Bookmark, BookmarkPlus } from "lucide-react" // Extra iconițe
import { Badge, BigNumber, Button, Card, CardTitle, Empty, Field, IconButton, Input, Label, Message, Screen, Segmented } from "@/app/components/ui"

const BarcodeScanner = dynamic(() => import("@/app/components/barcode-scanner"), { ssr: false })

const MEAL_TYPES = [
  { id: "Breakfast", label: "Mic Dejun" },
  { id: "Lunch", label: "Prânz" },
  { id: "Dinner", label: "Cină" },
  { id: "Snack", label: "Gustare" }
]

const DRAFT_KEY = "meal_draft_v1"

export default function InsertMealPage() {
  const { t, locale } = useLanguage()

  const router = useRouter()
  
  // State pentru Ciornă (Draft)
  const [mealType, setMealType] = useState("Breakfast")
  const [draftItems, setDraftItems] = useState<any[]>([])
  
  // State pentru Căutare
  const [query, setQuery] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<any[]>([])
  const [isScanning, setIsScanning] = useState(false)
  
  // State pentru Alimentul Selectat
  const [selectedFood, setSelectedFood] = useState<any | null>(null)
  const [grams, setGrams] = useState<string>("100")
  const [isSavingComplete, setIsSavingComplete] = useState(false)

  const [isCreatingCustom, setIsCreatingCustom] = useState(false)
  const [customFood, setCustomFood] = useState({
    name: "", kcal: "", protein: "", carbs: "", fat: ""
  })
  const [customFoodError, setCustomFoodError] = useState("") // <--- NOU

  // State pentru Șabloane
  const [activeTab, setActiveTab] = useState<"search" | "templates">("search")
  const [templates, setTemplates] = useState<any[]>([])
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [templateName, setTemplateName] = useState("")
  const [showTemplateInput, setShowTemplateInput] = useState(false)

  useEffect(() => {
    if (activeTab === "templates") {
      getUserTemplates().then(data => setTemplates(data))
    }
  }, [activeTab])

  async function handleSaveTemplate() {
    if (!templateName.trim() || draftItems.length === 0) return
    setIsSavingTemplate(true)
    
    const result = await saveMealTemplate(templateName, draftItems)
    if (result.success) {
      alert(t("Șablon salvat cu succes!", "Template saved successfully!"))
      setTemplateName("")
      setShowTemplateInput(false)
    } else {
      alert(t("Eroare: ", "Error: ") + result.error)
    }
    setIsSavingTemplate(false)
  }

  // Când dai click pe un șablon salvat, îl încarcă în draft
  function loadTemplateIntoDraft(templateItems: any[]) {
    // Adăugăm itemele din template la draft-ul existent, 
    // dar le dăm id-uri temporare noi ca să nu se încalece dacă adaugi de 2 ori
    const newItems = templateItems.map(item => ({
      ...item,
      id: Math.random().toString(36).substring(2, 9)
    }))
    setDraftItems(prev => [...prev, ...newItems])
    setActiveTab("search") // Ne întoarcem la ecranul principal
  }

  function handleAddCustomFoodToDraft() {
    setCustomFoodError("") // Resetăm eroarea la fiecare încercare

    // 1. Validare Nume
    if (!customFood.name.trim()) {
      setCustomFoodError(t("Te rog să introduci un nume pentru aliment.", "Please enter a food name."))
      return
    }

    // 2. Validare Calorii (Kcal este obligatoriu)
    const parsedKcal = Number(customFood.kcal)
    if (customFood.kcal === "" || isNaN(parsedKcal) || parsedKcal < 0) {
      setCustomFoodError(t("Caloriile trebuie să fie un număr valid (ex: 150).", "Calories must be a valid number (e.g. 150)."))
      return
    }

    // 3. Validare Macronutrienți (sunt opționali, dar dacă sunt puși, trebuie să fie numere)
    const p = customFood.protein ? Number(customFood.protein) : 0
    const c = customFood.carbs ? Number(customFood.carbs) : 0
    const f = customFood.fat ? Number(customFood.fat) : 0

    if (isNaN(p) || isNaN(c) || isNaN(f)) {
      setCustomFoodError(t("Macronutrienții (Proteine, Carbo, Grăsimi) trebuie să fie numere valide.", "Macronutrients (protein, carbs, fat) must be valid numbers."))
      return
    }

    // 4. Validare Gramaj
    const parsedGrams = Number(grams)
    if (!grams || isNaN(parsedGrams) || parsedGrams <= 0) {
      setCustomFoodError(t("Porția mâncată trebuie să fie un număr mai mare ca zero.", "The portion must be greater than zero."))
      return
    }

    // Dacă am trecut de toate validările, salvăm!
    const newItem = {
      id: Math.random().toString(36).substring(2, 9),
      food: {
        name: customFood.name.trim(),
        brand: "Creat Manual",
        kcal_per_100g: parsedKcal,
        protein_per_100g: p,
        carbs_per_100g: c,
        fat_per_100g: f,
      },
      grams: parsedGrams
    }

    setDraftItems(prev => [...prev, newItem])
    
    // Resetăm tot după adăugare cu succes
    setIsCreatingCustom(false)
    setCustomFood({ name: "", kcal: "", protein: "", carbs: "", fat: "" })
    setQuery("")
    setGrams("100")
    setCustomFoodError("")
  }

  // 1. Încărcăm ciorna din LocalStorage la prima randare
  useEffect(() => {
    const savedDraft = localStorage.getItem(DRAFT_KEY)
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft)
        if (parsed.items?.length > 0) {
          setDraftItems(parsed.items)
          if (parsed.type) setMealType(parsed.type)
        }
      } catch (e) {
        console.error("Eroare la citirea ciornei:", e)
      }
    }
  }, [])

  // 2. Salvăm ciorna în LocalStorage ori de câte ori se schimbă
  useEffect(() => {
    if (draftItems.length > 0) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ type: mealType, items: draftItems }))
    } else {
      localStorage.removeItem(DRAFT_KEY)
    }
  }, [draftItems, mealType])

  // Căutare Text
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query || query.length < 2) return
    setIsSearching(true)
    setSelectedFood(null)
    
    try {
      const res = await fetch(`/api/food/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (data.results) setResults(data.results)
    } catch (err) {
      console.error(err)
    } finally {
      setIsSearching(false)
    }
  }

  // Căutare Scanare
  async function handleBarcodeScan(scannedCode: string) {
    setIsScanning(false)
    setIsSearching(true)
    setSelectedFood(null)
    setQuery(scannedCode)

    try {
      const res = await fetch(`/api/food/barcode/${scannedCode}`)
      const data = await res.json()
      if (data.data) {
        setSelectedFood(data.data)
        setResults([]) 
      } else {
        alert(t("Produsul nu a fost găsit.", "Product not found."))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsSearching(false)
    }
  }

  // Adăugare în Ciorna Locală
  function handleAddToDraft() {
    if (!selectedFood || !grams) return
    
    const newItem = {
      id: Math.random().toString(36).substring(2, 9), // ID temporar
      food: selectedFood,
      grams: Number(grams)
    }

    setDraftItems(prev => [...prev, newItem])
    
    // Resetăm form-ul pentru a permite următoarea căutare
    setSelectedFood(null)
    setQuery("")
    setResults([])
    setGrams("100")
  }

  // Finalizare și Trimitere către DB
  async function handleFinishMeal() {
    if (draftItems.length === 0) return
    setIsSavingComplete(true)

    const result = await saveCompleteMeal(mealType, draftItems)
    
    if (result.success) {
      localStorage.removeItem(DRAFT_KEY) // Curățăm ciorna
      
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 }, colors: ['#c8f031', '#ffc233', '#7cc4ff'], disableForReducedMotion: true })
      
      setTimeout(() => {
        router.push("/meals/history")
      }, 1500)
    } else {
      alert(t("Eroare: ", "Error: ") + result.error)
      setIsSavingComplete(false)
    }
  }

  // Calculăm totalurile ciornei curente
  const draftTotals = draftItems.reduce((acc, item) => {
    const multiplier = item.grams / 100
    acc.kcal += item.food.kcal_per_100g * multiplier
    acc.p += item.food.protein_per_100g * multiplier
    acc.c += item.food.carbs_per_100g * multiplier
    acc.f += item.food.fat_per_100g * multiplier
    return acc
  }, { kcal: 0, p: 0, c: 0, f: 0 })

  return (
    <Screen title={<Text ro="Adaugă masă" en="Add meal" />} back="/meals">
      <Segmented
        label={t("Tipul mesei", "Meal type")}
        value={mealType}
        onChange={setMealType}
        options={MEAL_TYPES.map((type) => ({ value: type.id, label: t(type.label, type.id) }))}
      />

      <Segmented
        label={t("Sursa alimentelor", "Food source")}
        value={activeTab}
        onChange={setActiveTab}
        options={[
          { value: "search", label: t("Căutare aliment", "Find food"), icon: Search },
          { value: "templates", label: t("Mesele mele", "My meals"), icon: Bookmark },
        ]}
      />

      {activeTab === "search" ? (
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Caută (ex: orez)...", "Search (e.g. rice)...")}
              aria-label={t("Caută aliment", "Search food")}
              className="min-h-[52px] w-full rounded-md border-[1.5px] border-transparent bg-card pl-11 pr-3.5 font-medium text-foreground outline-none transition-colors focus:border-lime focus-visible:outline-none" />
          </div>
          <button type="button" onClick={() => setIsScanning(true)} className="flex size-[52px] shrink-0 items-center justify-center rounded-md bg-card text-lime-text">
            <ScanBarcode className="size-6" />
            <span className="sr-only"><Text ro="Scanează codul de bare" en="Scan barcode" /></span>
          </button>
        </form>
      ) : templates.length === 0 ? (
        <Empty icon={Bookmark}><Text ro="Nu ai niciun șablon salvat încă." en="You have no saved templates yet." /></Empty>
      ) : (
        templates.map(tpl => (
          <Card key={tpl.id}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[17px] font-semibold">{tpl.name}</span>
              <Badge>{tpl.items.length} <Text ro="alimente" en="foods" /></Badge>
            </div>
            <p className="line-clamp-1 text-[13px] text-muted">{tpl.items.map((i: any) => i.food.name).join(", ")}</p>
            <Button variant="soft" small icon={Plus} onClick={() => loadTemplateIntoDraft(tpl.items)}>
              <Text ro="Adaugă în ciornă" en="Add to draft" />
            </Button>
          </Card>
        ))
      )}

      {/* Portion of the selected food */}
      {selectedFood && (
        <Card tone="lime">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold leading-tight text-foreground"><FoodLabel value={selectedFood.name} /></h2>
              <p className="text-[13px] text-muted"><FoodLabel value={selectedFood.brand || ""} /></p>
            </div>
            <IconButton plain icon={X} label={t("Elimină", "Remove")} onClick={() => setSelectedFood(null)} className="-mr-2 -mt-2" />
          </div>
          <div className="flex items-end gap-2.5">
            <Field label={<Text ro="Grame" en="Grams" />} htmlFor="food-grams" className="flex-1">
              <Input id="food-grams" big type="number" inputMode="decimal" min="1" value={grams} onChange={(e) => setGrams(e.target.value)} />
            </Field>
            <Button icon={Plus} onClick={handleAddToDraft}>
              <Text ro="Adaugă" en="Add" />
            </Button>
          </div>
        </Card>
      )}

      {/* Search results and custom food */}
      {!selectedFood && activeTab === "search" && (
        <>
          {isSearching && (
            <div role="status" className="flex justify-center py-5 text-lime-text">
              <Loader2 className="size-6 animate-spin" />
              <span className="sr-only">{t("Se caută...", "Searching...")}</span>
            </div>
          )}

          {isCreatingCustom ? (
            <Card>
              <CardTitle><Text ro="Aliment creat manual (per 100 g)" en="Custom food (per 100 g)" /></CardTitle>
              <Field label={<Text ro="Nume" en="Name" />} htmlFor="custom-name">
                <Input id="custom-name" type="text" placeholder={t("Nume aliment...", "Food name...")} value={customFood.name} onChange={e => setCustomFood({...customFood, name: e.target.value})} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Kcal" htmlFor="custom-kcal">
                  <Input id="custom-kcal" big type="number" inputMode="decimal" placeholder="0" value={customFood.kcal} onChange={e => setCustomFood({...customFood, kcal: e.target.value})} />
                </Field>
                <Field label={<Text ro="Proteine" en="Protein" />} htmlFor="custom-protein">
                  <Input id="custom-protein" big type="number" inputMode="decimal" placeholder="0" value={customFood.protein} onChange={e => setCustomFood({...customFood, protein: e.target.value})} />
                </Field>
                <Field label={<Text ro="Carbohidrați" en="Carbs" />} htmlFor="custom-carbs">
                  <Input id="custom-carbs" big type="number" inputMode="decimal" placeholder="0" value={customFood.carbs} onChange={e => setCustomFood({...customFood, carbs: e.target.value})} />
                </Field>
                <Field label={<Text ro="Grăsimi" en="Fat" />} htmlFor="custom-fat">
                  <Input id="custom-fat" big type="number" inputMode="decimal" placeholder="0" value={customFood.fat} onChange={e => setCustomFood({...customFood, fat: e.target.value})} />
                </Field>
              </div>
              <Field label={<Text ro="Porție mâncată (g)" en="Portion eaten (g)" />} htmlFor="custom-grams">
                <Input id="custom-grams" big type="number" inputMode="decimal" value={grams} onChange={e => setGrams(e.target.value)} />
              </Field>
              {customFoodError && <Message>{customFoodError}</Message>}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => { setIsCreatingCustom(false); setCustomFoodError("") }} className="flex-1"><Text ro="Anulează" en="Cancel" /></Button>
                <Button icon={Plus} onClick={handleAddCustomFoodToDraft} className="flex-[2]"><Text ro="Adaugă" en="Add" /></Button>
              </div>
            </Card>
          ) : (
            <>
              {results.length > 0 && (
                <Card padded={false}>
                  {results.map((food, idx) => (
                    <button key={food.id || food.barcode || idx} type="button" onClick={() => setSelectedFood(food)}
                      className={`flex w-full items-center gap-3 px-[18px] py-3.5 text-left transition-colors active:bg-inner ${idx > 0 ? "border-t border-line" : ""}`}>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="line-clamp-1 font-medium"><FoodLabel value={food.name} /></span>
                        <span className="text-[13px] text-muted tabular-nums">{food.kcal_per_100g} kcal / 100 g</span>
                      </span>
                      <Plus className="size-5 shrink-0 text-muted" />
                    </button>
                  ))}
                </Card>
              )}
              {!isSearching && (
                <Button variant="outline" icon={Plus} onClick={() => setIsCreatingCustom(true)}>
                  <Text ro="Nu găsești ce cauți? Creează aliment" en="Can't find your food? Create it" />
                </Button>
              )}
            </>
          )}
        </>
      )}

      {/* Current draft of the meal */}
      {draftItems.length > 0 && (
        <>
          <Card>
            <Label><Text ro="Total masă" en="Meal total" /></Label>
            <BigNumber value={Math.round(draftTotals.kcal).toLocaleString(locale)} unit="kcal" />
            <div className="flex flex-wrap gap-x-3 text-[13px] font-medium tabular-nums">
              <span className="text-lime-text">{Math.round(draftTotals.p * 10) / 10}g P</span>
              <span className="text-ice-text">{Math.round(draftTotals.c * 10) / 10}g C</span>
              <span className="text-gold-text">{Math.round(draftTotals.f * 10) / 10}g {t("G", "F")}</span>
            </div>
          </Card>

          <ul className="flex flex-col overflow-hidden rounded-lg bg-card">
            {draftItems.map((item, index) => {
              const multiplier = item.grams / 100;
              const itemKcal = Math.round(item.food.kcal_per_100g * multiplier);
              const itemP = Math.round((item.food.protein_per_100g * multiplier) * 10) / 10;
              const itemC = Math.round((item.food.carbs_per_100g * multiplier) * 10) / 10;
              const itemF = Math.round((item.food.fat_per_100g * multiplier) * 10) / 10;
              return (
                <li key={item.id} className={`flex items-start gap-3 px-[18px] py-3.5 ${index > 0 ? "border-t border-line" : ""}`}>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="break-words font-medium leading-tight"><FoodLabel value={item.food.name} /></span>
                    <span className="text-[13px] text-muted tabular-nums">{item.grams} g · <span className="font-semibold text-foreground">{itemKcal}</span> kcal</span>
                    <span className="flex flex-wrap gap-x-3 text-[13px] tabular-nums">
                      <span className="text-lime-text">P {itemP}g</span>
                      <span className="text-ice-text">C {itemC}g</span>
                      <span className="text-gold-text">{t("G", "F")} {itemF}g</span>
                    </span>
                  </div>
                  <IconButton plain icon={Trash2} label={t("Elimină", "Remove")} className="-mr-2"
                    onClick={() => setDraftItems(prev => prev.filter(x => x.id !== item.id))} />
                </li>
              )
            })}
          </ul>

          <Button large icon={Save} onClick={handleFinishMeal} busy={isSavingComplete} className="mt-2">
            <Text ro="Finalizează masa" en="Finish meal" />
          </Button>

          {!showTemplateInput ? (
            <Button variant="outline" icon={BookmarkPlus} onClick={() => setShowTemplateInput(true)}>
              <Text ro="Salvează combinația ca șablon" en="Save this combination as a template" />
            </Button>
          ) : (
            <Card>
              <Field label={<Text ro="Nume șablon" en="Template name" />} htmlFor="template-name">
                <Input id="template-name" type="text" placeholder={t("Nume (ex: Omletă dimineață)...", "Name (e.g. Morning omelette)...")}
                  value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
              </Field>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setShowTemplateInput(false)} className="flex-1"><Text ro="Anulează" en="Cancel" /></Button>
                <Button onClick={handleSaveTemplate} busy={isSavingTemplate} className="flex-[2]">{t("Salvează", "Save")}</Button>
              </div>
            </Card>
          )}
        </>
      )}

      {isScanning && <BarcodeScanner onResult={handleBarcodeScan} onClose={() => setIsScanning(false)} />}
    </Screen>
  )
}
