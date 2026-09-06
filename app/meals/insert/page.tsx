"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import { ArrowLeft, Search, Loader2, Plus, Check, ScanBarcode, Trash2, Save, Flame, Wheat, Droplet, Cookie } from "lucide-react"
import confetti from "canvas-confetti"
import { saveCompleteMeal, saveMealTemplate, getUserTemplates } from "../action"
import { Bookmark, BookmarkPlus } from "lucide-react" // Extra iconițe

const BarcodeScanner = dynamic(() => import("@/app/components/barcode-scanner"), { ssr: false })

const MEAL_TYPES = [
  { id: "Breakfast", label: "Mic Dejun" },
  { id: "Lunch", label: "Prânz" },
  { id: "Dinner", label: "Cină" },
  { id: "Snack", label: "Gustare" }
]

const DRAFT_KEY = "meal_draft_v1"

export default function InsertMealPage() {
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
      alert("Șablon salvat cu succes!")
      setTemplateName("")
      setShowTemplateInput(false)
    } else {
      alert("Eroare: " + result.error)
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
      setCustomFoodError("Te rog să introduci un nume pentru aliment.")
      return
    }

    // 2. Validare Calorii (Kcal este obligatoriu)
    const parsedKcal = Number(customFood.kcal)
    if (customFood.kcal === "" || isNaN(parsedKcal) || parsedKcal < 0) {
      setCustomFoodError("Caloriile trebuie să fie un număr valid (ex: 150).")
      return
    }

    // 3. Validare Macronutrienți (sunt opționali, dar dacă sunt puși, trebuie să fie numere)
    const p = customFood.protein ? Number(customFood.protein) : 0
    const c = customFood.carbs ? Number(customFood.carbs) : 0
    const f = customFood.fat ? Number(customFood.fat) : 0

    if (isNaN(p) || isNaN(c) || isNaN(f)) {
      setCustomFoodError("Macronutrienții (Proteine, Carbo, Grăsimi) trebuie să fie numere valide.")
      return
    }

    // 4. Validare Gramaj
    const parsedGrams = Number(grams)
    if (!grams || isNaN(parsedGrams) || parsedGrams <= 0) {
      setCustomFoodError("Porția mâncată trebuie să fie un număr mai mare ca zero.")
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
        alert("Produsul nu a fost găsit.")
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
      
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 }, colors: ['#f97316', '#fb923c', '#fdba74'] }) // Portocaliu
      
      setTimeout(() => {
        router.push("/meals/history")
      }, 1500)
    } else {
      alert("Eroare: " + result.error)
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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col p-5 bg-zinc-950 text-zinc-100">
      
      {/* HEADER */}
      <header className="flex flex-col gap-6 mb-6 mt-2">
        <div className="flex items-center justify-between">
          <Link href="/meals" className="p-2.5 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-xl transition-all">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-xl font-bold tracking-tight">Adaugă Masă</h1>
          <div className="size-10"></div>
        </div>
        
        <div className="grid grid-cols-4 gap-1 p-1.5 border border-zinc-800/80 rounded-2xl bg-zinc-900/60 shadow-inner">
          {MEAL_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() => setMealType(type.id)}
              className={`py-2 rounded-xl text-[10px] sm:text-xs font-bold transition-all uppercase tracking-wider ${
                mealType === type.id 
                  ? "bg-zinc-800 text-orange-400 shadow-md border border-zinc-700/50" 
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </header>

      {/* SEARCH BAR */}
      {/* TABS: CĂUTARE / ȘABLOANE */}
      <div className="flex bg-zinc-900/60 p-1 rounded-2xl mb-4 border border-zinc-800/80">
        <button onClick={() => setActiveTab("search")} className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${activeTab === "search" ? "bg-zinc-800 text-orange-400 shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}>Căutare Aliment</button>
        <button onClick={() => setActiveTab("templates")} className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === "templates" ? "bg-zinc-800 text-orange-400 shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}><Bookmark className="size-3"/> Mesele Mele</button>
      </div>

      {activeTab === "search" ? (
        <form onSubmit={handleSearch} className="flex items-center gap-2 mb-6">
          <div className="relative flex-1">
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Caută (ex: orez)..." className="h-14 w-full pl-12 pr-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 text-zinc-100 font-semibold focus:border-orange-500 outline-none shadow-inner" />
            <Search className="absolute left-4 top-4 size-5 text-zinc-500" />
          </div>
          <button type="button" onClick={() => setIsScanning(true)} className="size-14 flex items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800 text-orange-400 shrink-0">
            <ScanBarcode className="size-6" />
          </button>
        </form>
      ) : (
        /* LISTA DE ȘABLOANE SALVATE */
        <div className="flex flex-col gap-3 mb-6 animate-in fade-in">
          {templates.length === 0 ? (
            <div className="text-center py-10 text-zinc-500 text-sm">Nu ai niciun șablon salvat încă.</div>
          ) : (
            templates.map(tpl => (
              <div key={tpl.id} className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/60 flex flex-col gap-3 hover:border-orange-500/50 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-100">{tpl.name}</span>
                  <span className="text-xs font-mono text-orange-400">{tpl.items.length} alimente</span>
                </div>
                <div className="text-xs text-zinc-500 line-clamp-1">
                  {tpl.items.map((i: any) => i.food.name).join(", ")}
                </div>
                <button onClick={() => loadTemplateIntoDraft(tpl.items)} className="mt-1 h-10 w-full bg-orange-500/10 text-orange-400 font-bold rounded-xl border border-orange-500/20 hover:bg-orange-500/20 transition-all flex justify-center items-center gap-2">
                  <Plus className="size-4"/> Adaugă în Ciornă
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* POPUP DE GRAMAJ PENTRU ALIMENTUL SELECTAT */}
      {selectedFood && (
        <div className="p-5 mb-6 border border-orange-500/30 rounded-3xl bg-orange-500/5 shadow-xl relative overflow-hidden animate-in slide-in-from-bottom-4">
          <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="relative z-10">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-lg text-zinc-100 leading-tight">{selectedFood.name}</h3>
                <p className="text-xs text-orange-400/80 font-mono mb-4">{selectedFood.brand}</p>
              </div>
              <button onClick={() => setSelectedFood(null)} className="p-1 text-zinc-500 hover:text-red-400"><Trash2 className="size-4"/></button>
            </div>
            
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1.5 flex-1">
                <label className="text-[11px] uppercase font-bold text-zinc-500 pl-1">Grame</label>
                <input 
                  type="number" min="1" value={grams} onChange={(e) => setGrams(e.target.value)}
                  className="h-12 px-4 rounded-xl border border-orange-500/30 bg-zinc-950 text-orange-400 text-lg font-bold outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handleAddToDraft}
                className="h-12 px-6 flex items-center gap-2 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 font-bold hover:bg-orange-500 hover:text-zinc-950 transition-all active:scale-95"
              >
                <Plus className="size-5" /> Adaugă
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REZULTATE CĂUTARE & CREARE MANUALĂ */}
      {!selectedFood && (
        <div className="flex flex-col gap-2 mb-6">
          {isSearching && (
            <div className="flex justify-center py-5 text-orange-500"><Loader2 className="size-6 animate-spin" /></div>
          )}
          
          {/* Formularul de Creare Manuală */}
          {isCreatingCustom ? (
            <div className="p-4 rounded-3xl bg-zinc-900/80 border border-orange-500/30 flex flex-col gap-3 animate-in fade-in">
              <h3 className="text-sm font-bold text-zinc-100">Creare Aliment Manual (per 100g)</h3>
              
              <input type="text" placeholder="Nume aliment..." value={customFood.name} onChange={e => setCustomFood({...customFood, name: e.target.value})} className="h-12 px-4 rounded-xl bg-zinc-950 border border-zinc-800 text-sm outline-none focus:border-orange-500" />
              
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-500 uppercase font-bold pl-1">Kcal</label>
                  <input type="number" placeholder="0" value={customFood.kcal} onChange={e => setCustomFood({...customFood, kcal: e.target.value})} className="h-10 px-3 rounded-lg bg-zinc-950 border border-zinc-800 outline-none focus:border-orange-500 text-orange-400 font-bold" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-500 uppercase font-bold pl-1">Proteine</label>
                  <input type="number" placeholder="0" value={customFood.protein} onChange={e => setCustomFood({...customFood, protein: e.target.value})} className="h-10 px-3 rounded-lg bg-zinc-950 border border-zinc-800 outline-none focus:border-emerald-500 text-emerald-400 font-bold" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-500 uppercase font-bold pl-1">Carbo</label>
                  <input type="number" placeholder="0" value={customFood.carbs} onChange={e => setCustomFood({...customFood, carbs: e.target.value})} className="h-10 px-3 rounded-lg bg-zinc-950 border border-zinc-800 outline-none focus:border-cyan-500 text-cyan-400 font-bold" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-500 uppercase font-bold pl-1">Grăsimi</label>
                  <input type="number" placeholder="0" value={customFood.fat} onChange={e => setCustomFood({...customFood, fat: e.target.value})} className="h-10 px-3 rounded-lg bg-zinc-950 border border-zinc-800 outline-none focus:border-yellow-500 text-yellow-400 font-bold" />
                </div>
              </div>

              <div className="flex items-end gap-2 mt-2">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-[10px] text-zinc-500 uppercase font-bold pl-1">Porție mâncată (g)</label>
                  <input type="number" value={grams} onChange={e => setGrams(e.target.value)} className="h-12 px-3 rounded-xl bg-zinc-950 border border-orange-500/30 outline-none text-zinc-100 font-bold" />
                </div>
                <button onClick={handleAddCustomFoodToDraft} className="h-12 px-6 bg-orange-500 text-zinc-950 font-bold rounded-xl flex items-center gap-2 hover:bg-orange-400">
                  <Plus className="size-4" /> Adaugă
                </button>
              </div>
              <button onClick={() => setIsCreatingCustom(false)} className="text-xs text-zinc-500 mt-2 hover:text-zinc-300">Anulează</button>
            </div>
          ) : (
            <>
              {results.map((food, idx) => (
                <button
                  key={food.id || food.barcode || idx}
                  onClick={() => setSelectedFood(food)}
                  className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/60 hover:bg-zinc-800 transition-all text-left"
                >
                  <div className="flex flex-col pr-4">
                    <span className="font-bold text-sm text-zinc-200 line-clamp-1">{food.name}</span>
                    <span className="text-xs text-zinc-500 font-mono">{food.kcal_per_100g} kcal / 100g</span>
                  </div>
                  <Plus className="size-4 text-zinc-500 shrink-0" />
                </button>
              ))}
              
              {!isSearching && (
                <button 
                  onClick={() => setIsCreatingCustom(true)}
                  className="mt-2 p-3 rounded-2xl border border-dashed border-zinc-700 text-zinc-400 text-sm font-medium hover:text-orange-400 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="size-4" /> Nu găsești ce cauți? Creează aliment
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ========================================= */}
      {/* CIORNA CURENTĂ (Draft-ul mesei) */}
      {/* ========================================= */}
      {draftItems.length > 0 && (
        <div className="mt-auto flex flex-col gap-3 pb-6 animate-in fade-in">
          
          {/* HEADER TOTALURI MASĂ */}
          <div className="flex flex-col gap-1.5 px-2 mt-4 bg-zinc-900/40 border border-zinc-800/80 p-3 rounded-2xl shadow-inner">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-zinc-800/60 pb-1.5 mb-1">
              Total Masă
            </h3>
            <div className="flex items-center justify-between text-xs font-mono font-bold">
              <span className="text-orange-400 text-sm">{Math.round(draftTotals.kcal)} kcal</span>
              <div className="flex gap-3">
                <span className="text-emerald-400">{Math.round(draftTotals.p * 10) / 10}g P</span>
                <span className="text-cyan-400">{Math.round(draftTotals.c * 10) / 10}g C</span>
                <span className="text-yellow-400">{Math.round(draftTotals.f * 10) / 10}g G</span>
              </div>
            </div>
          </div>

          {/* LISTA ALIMENTELOR ADĂUGATE */}
          <div className="flex flex-col gap-2">
            {draftItems.map((item) => {
              // Calculăm macros pentru gramajul specific al acestui item
              const multiplier = item.grams / 100;
              const itemKcal = Math.round(item.food.kcal_per_100g * multiplier);
              const itemP = Math.round((item.food.protein_per_100g * multiplier) * 10) / 10;
              const itemC = Math.round((item.food.carbs_per_100g * multiplier) * 10) / 10;
              const itemF = Math.round((item.food.fat_per_100g * multiplier) * 10) / 10;

              return (
                <div key={item.id} className="flex flex-col gap-2 p-3 rounded-2xl border border-zinc-800/60 bg-zinc-900/40 relative overflow-hidden">
                  <div className="flex items-start justify-between z-10 relative">
                    <div className="flex flex-col">
                      <span className="font-bold text-sm text-zinc-200 leading-tight">{item.food.name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono mt-0.5">{item.grams}g</span>
                    </div>
                    <button 
                      onClick={() => setDraftItems(prev => prev.filter(x => x.id !== item.id))}
                      className="p-1.5 text-red-500/70 hover:text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors active:scale-95 shrink-0"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  {/* RANDUL CU MACRO-URI PENTRU ITEM-UL CURENT */}
                  <div className="grid grid-cols-4 gap-1 pt-2 border-t border-zinc-800/60 mt-1 z-10 relative">
                    <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-300">
                      <Flame className="size-3 text-orange-500" />
                      <span>{itemKcal}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                      <span className="font-bold">P:</span>
                      <span>{itemP}g</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-mono text-cyan-400">
                      <span className="font-bold">C:</span>
                      <span>{itemC}g</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-mono text-yellow-400">
                      <span className="font-bold">G:</span>
                      <span>{itemF}g</span>
                    </div>
                  </div>

                  {/* MESAJ DE EROARE (Apare doar dacă e cazul) */}
              {customFoodError && (
                <div className="text-xs font-bold text-red-400 bg-red-500/10 p-3 rounded-xl border border-red-500/20 mt-1 animate-in fade-in">
                  {customFoodError}
                </div>)}
                </div>
                
                
              )
            })}
          </div>

          

          {/* Butonul Uriaș de Salvare */}
          <button
            onClick={handleFinishMeal}
            disabled={isSavingComplete}
            className="h-14 w-full mt-4 bg-emerald-500 text-zinc-950 font-extrabold text-lg rounded-2xl flex items-center justify-center gap-2 hover:bg-emerald-400 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20"
          >
            {isSavingComplete ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />}
            Finalizează Masa
          </button>
          {/* SECȚIUNE SALVARE ȘABLON (TEMPLATE) */}
          <div className="mt-2 flex flex-col gap-2">
            {!showTemplateInput ? (
              <button 
                onClick={() => setShowTemplateInput(true)}
                className="h-12 w-full border border-dashed border-zinc-700 rounded-2xl text-zinc-400 text-sm font-bold flex items-center justify-center gap-2 hover:border-orange-500/50 hover:text-orange-400 transition-all"
              >
                <BookmarkPlus className="size-4" /> Salvează combinația ca Șablon
              </button>
            ) : (
              <div className="flex items-center gap-2 p-2 bg-zinc-900 rounded-2xl border border-orange-500/30 animate-in fade-in">
                <input 
                  type="text" 
                  placeholder="Nume (ex: Omletă dimineață)..."
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="flex-1 h-10 bg-transparent px-3 text-sm text-zinc-100 outline-none"
                />
                <button 
                  onClick={handleSaveTemplate}
                  disabled={isSavingTemplate}
                  className="h-10 px-4 bg-orange-500 text-zinc-950 text-xs font-bold rounded-xl hover:bg-orange-400"
                >
                  {isSavingTemplate ? "..." : "Salvează"}
                </button>
                <button onClick={() => setShowTemplateInput(false)} className="px-2 text-zinc-500 hover:text-zinc-300"><Trash2 className="size-4"/></button>
              </div>
            )}
          </div>
        </div>
      )}

      {isScanning && <BarcodeScanner onResult={handleBarcodeScan} onClose={() => setIsScanning(false)} />}
    </main>
  )
}