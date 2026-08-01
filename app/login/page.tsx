"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Dumbbell, Loader2 } from "lucide-react"
import { loginUser } from "./action"
import Link from "next/link"

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  // Folosim direct FormData nativ în loc de event.preventDefault()
  async function handleAction(formData: FormData) {
    setIsPending(true)
    setError(null)
    
    const result = await loginUser(formData)
    
    if (result?.error) {
      setError(result.error)
      setIsPending(false) // Oprim rotița dacă e eroare
    } else {
      router.push("/") // Totul e ok, mergem pe dashboard
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-5 bg-background">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center mb-8">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Dumbbell className="size-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Bine ai revenit!</h1>
          <p className="text-sm text-muted-foreground">
            Conectează-te pentru a-ți accesa antrenamentele.
          </p>
        </div>

        {/* Am schimbat onSubmit cu action */}
        <form action={handleAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <input
              id="email" name="email" type="email" required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="nume@exemplu.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">Parolă</label>
            <input
              id="password" name="password" type="password" required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

<div className="mt-6 text-center text-sm text-muted-foreground">
          Nu ai cont?{" "}
          <Link href="/register" className="font-medium text-foreground underline hover:text-primary">
            Creează unul
          </Link>
        </div>
        
          <button
            type="submit" disabled={isPending}
            className="inline-flex h-10 mt-2 items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {isPending ? <><Loader2 className="mr-2 size-4 animate-spin" /> Se verifică...</> : "Loghează-te"}
          </button>
        </form>
      </div>
    </main>
  )
}