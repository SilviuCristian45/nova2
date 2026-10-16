"use client"

import { useLanguage } from "@/app/components/language-provider"
import { useTransition } from "react"
import { Loader2, Trash2 } from "lucide-react"
import { deleteWorkout } from "./actions"

export function DeleteWorkoutButton({ id }: { id: string }) {
  const { t } = useLanguage()

  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    // Un mic pop-up nativ de confirmare
    if (!window.confirm(t("Ești sigur că vrei să ștergi acest antrenament?", "Are you sure you want to delete this workout?"))) return

    startTransition(async () => {
      const result = await deleteWorkout(id)
      if (result.error) {
        alert(result.error) // Afișăm eroarea direct, simplu
      }
    })
  }

  return (
    <button 
      onClick={handleDelete}
      disabled={isPending}
      className="p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 rounded-md transition-colors disabled:opacity-50"
      title={t("Șterge antrenament", "Delete workout")}
    >
      {isPending ? <Loader2 className="size-5 animate-spin" /> : <Trash2 className="size-5" />}
    </button>
  )
}