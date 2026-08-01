"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Dumbbell, Loader2 } from "lucide-react"
import { registerUser } from "./actions"

export default function RegisterPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function handleAction(formData: FormData) {
    setIsPending(true)
    setError(null)
    
    const result = await registerUser(formData)
    
    if (result?.error) {
      setError(result.error)
      setIsPending(false)
    } else {
      router.push("/")
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-5 bg-background">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center mb-8">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Dumbbell className="size-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Creează Cont</h1>
          <p className="text-sm text-muted-foreground">
            Începe să îți urmărești antrenamentele.
          </p>
        </div>

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
              id="password" name="password" type="password" required minLength={6}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Minim 6 caractere"
            />
          </div>

          {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

          <button
            type="submit" disabled={isPending}
            className="inline-flex h-10 mt-2 items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {isPending ? <><Loader2 className="mr-2 size-4 animate-spin" /> Se creează contul...</> : "Înregistrează-te"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Ai deja cont?{" "}
          <Link href="/login" className="font-medium text-foreground underline hover:text-primary">
            Loghează-te
          </Link>
        </div>
      </div>
    </main>
  )
}