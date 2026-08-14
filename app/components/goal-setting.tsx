// app/components/goal-setting.tsx
"use client"

import { useState } from "react"
import { Target, Edit2, Check, X, Loader2 } from "lucide-react"
import { updateDailyGoal } from "../profiles/profile"

interface GoalSettingProps {
  currentGoal: number
}

export default function GoalSetting({ currentGoal }: GoalSettingProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [goal, setGoal] = useState(currentGoal.toString())
  const [isPending, setIsPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const formattedGoal = currentGoal.toLocaleString('ro-RO')

  async function handleSave() {
    const newGoal = parseInt(goal, 10)
    if (isNaN(newGoal) || newGoal <= 0) {
      setMessage("❌ Invalid")
      setTimeout(() => setMessage(null), 2000)
      return
    }

    if (newGoal === currentGoal) {
      setIsEditing(false)
      return
    }

    setIsPending(true)
    const formData = new FormData()
    formData.append("dailyGoal", goal)

    const result = await updateDailyGoal(formData)
    
    if (result?.error) {
      setMessage(`❌ Eroare`)
    } else {
      setIsEditing(false)
      setMessage(null)
    }
    setIsPending(false)
  }

  function handleCancel() {
    setGoal(currentGoal.toString())
    setIsEditing(false)
    setMessage(null)
  }

  return (
    <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-zinc-950/50 border border-zinc-800/80 mb-4 shadow-inner relative overflow-hidden">
      <div className="flex items-center gap-3 relative z-10">
        <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 shadow-inner">
          <Target className="size-5 text-amber-500" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1">Obiectiv Zilnic</span>
          
          {isEditing ? (
            <input
              type="number"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              step="500"
              min="1000"
              className="h-8 w-28 px-2 rounded-lg border border-amber-500/50 bg-zinc-950 text-amber-400 font-bold focus:ring-1 focus:ring-amber-500/50 outline-none transition-all shadow-inner"
            />
          ) : (
            <span className="text-xl font-extrabold text-zinc-100 pl-1">{formattedGoal} <span className="text-sm text-zinc-500 font-medium">pași</span></span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 relative z-10">
        {message && (
          <span className={`text-xs font-bold ${message.startsWith('❌') ? 'text-red-500' : 'text-emerald-400'}`}>
            {message}
          </span>
        )}
        
        {isEditing ? (
          <>
            <button
              onClick={handleSave}
              disabled={isPending}
              className="size-9 flex items-center justify-center rounded-xl bg-amber-500 text-zinc-950 hover:bg-amber-400 disabled:opacity-50 transition-all active:scale-95"
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            </button>
            <button
              onClick={handleCancel}
              disabled={isPending}
              className="size-9 flex items-center justify-center rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 transition-all active:scale-95 border border-zinc-700/50"
            >
              <X className="size-4" />
            </button>
          </>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="size-9 flex items-center justify-center rounded-xl bg-zinc-800/80 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-all active:scale-95 border border-zinc-700/50"
          >
            <Edit2 className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}