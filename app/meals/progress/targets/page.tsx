"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Target, Save, Loader2, Flame, Wheat, Droplet, Cookie } from "lucide-react"
import { getUserTargets, saveUserTargets } from "@/app/meals/action"

export default function EditTargetsPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [targets, setTargets] = useState({ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })

  useEffect(() => {
    async function loadData() {
      const res = await getUserTargets()
      if (res.targets) setTargets(res.targets)
      setIsLoading(false)
    }
    loadData()
  }, [])

  async function handleSave() {
    setIsSaving(true)
    const res = await saveUserTargets(targets)
    if (res.success) {
      router.push("/meals/progress") // Ne întoarcem la dashboard
    } else {
      alert("Eroare la salvare!")
      setIsSaving(false)
    }
  }

  if (isLoading) return <div className="min-h-dvh flex items-center justify-center bg-zinc-950"><Loader2 className="size-8 animate-spin text-orange-500" /></div>

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col p-5 bg-zinc-950 text-zinc-100">
      
      <header className="flex items-center gap-4 mb-8 mt-2">
        <Link href="/meals/progress" className="p-2.5 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-xl transition-all">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Target className="size-6 text-orange-500" /> Obiectivele Tale
        </h1>
      </header>

      <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4">
        
        {/* KCAL */}
        <div className="flex flex-col gap-2 p-4 rounded-3xl bg-zinc-900/60 border border-orange-500/30">
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
            <Flame className="size-4 text-orange-500" /> Total Calorii (Kcal)
          </label>
          <input 
            type="number" 
            value={targets.kcal} 
            onChange={e => setTargets({...targets, kcal: Number(e.target.value)})}
            className="h-14 px-4 bg-zinc-950 border border-zinc-800 rounded-xl text-2xl font-black text-orange-400 outline-none focus:border-orange-500 transition-all"
          />
        </div>

        {/* MACROS GRID */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1">
              <div className="size-3 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center text-[6px]">P</div> Proteine (g)
            </label>
            <input 
              type="number" value={targets.protein} onChange={e => setTargets({...targets, protein: Number(e.target.value)})}
              className="h-12 px-3 bg-zinc-900 border border-zinc-800 rounded-xl text-lg font-bold text-emerald-400 outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1">
              <Wheat className="size-3 text-cyan-400" /> Carbohidrați (g)
            </label>
            <input 
              type="number" value={targets.carbs} onChange={e => setTargets({...targets, carbs: Number(e.target.value)})}
              className="h-12 px-3 bg-zinc-900 border border-zinc-800 rounded-xl text-lg font-bold text-cyan-400 outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1">
              <Droplet className="size-3 text-yellow-400" /> Grăsimi (g)
            </label>
            <input 
              type="number" value={targets.fat} onChange={e => setTargets({...targets, fat: Number(e.target.value)})}
              className="h-12 px-3 bg-zinc-900 border border-zinc-800 rounded-xl text-lg font-bold text-yellow-400 outline-none focus:border-yellow-500"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1">
              <Cookie className="size-3 text-purple-400" /> Fibre (g)
            </label>
            <input 
              type="number" value={targets.fiber} onChange={e => setTargets({...targets, fiber: Number(e.target.value)})}
              className="h-12 px-3 bg-zinc-900 border border-zinc-800 rounded-xl text-lg font-bold text-purple-400 outline-none focus:border-purple-500"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="mt-6 h-14 w-full bg-emerald-500 text-zinc-950 font-extrabold text-lg rounded-2xl flex items-center justify-center gap-2 hover:bg-emerald-400 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20"
        >
          {isSaving ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />}
          Salvează Obiectivele
        </button>

      </div>
    </main>
  )
}