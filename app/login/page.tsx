"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Dumbbell, Loader2 } from "lucide-react"
import { loginUser } from "./action"

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function handleAction(formData: FormData) {
    setIsPending(true)
    setError(null)
    
    const result = await loginUser(formData)
    
    if (result?.error) {
      setError(result.error)
      setIsPending(false)
    } else {
      router.push("/")
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-5 bg-zinc-950 text-zinc-100">
      
      {/* BRANDING */}
      <div className="flex flex-col items-center gap-2 text-center mb-8">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 shadow-inner">
          <Dumbbell className="size-7 text-emerald-400" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight mt-2">RepLog</h1>
        <p className="text-sm font-medium text-zinc-400">
          Track every set. Beat every session.
        </p>
      </div>

      {/* CARD FORMULAR */}
      <div className="w-full max-w-sm rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-8 shadow-2xl backdrop-blur-md relative overflow-hidden">
        {/* Glow de fundal */}
        <div className="absolute -top-20 -right-20 w-56 h-56 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="mb-6 relative z-10">
          <h2 className="text-xl font-bold text-zinc-100">Welcome back</h2>
          <p className="text-xs text-zinc-400 mt-1">Sign in to log your training</p>
        </div>

        <form action={handleAction} className="flex flex-col gap-4 relative z-10">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1">Email</label>
            <input
              id="email" name="email" type="email" required
              className="flex h-12 w-full rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-2 text-sm text-zinc-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all placeholder:text-zinc-600 shadow-inner"
              placeholder="name@example.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 pl-1">Password</label>
            <input
              id="password" name="password" type="password" required
              className="flex h-12 w-full rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-2 text-sm text-zinc-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all placeholder:text-zinc-600 shadow-inner"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="mt-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3">
              <p className="text-xs text-red-500 font-bold text-center">{error}</p>
            </div>
          )}

          <button
            type="submit" disabled={isPending}
            className="inline-flex h-12 mt-4 items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20"
          >
            {isPending ? <><Loader2 className="mr-2 size-4 animate-spin" /> Signing in...</> : "Sign in"}
          </button>
        </form>
      </div>

      {/* FOOTER LINK */}
      <div className="mt-8 text-center text-sm font-medium text-zinc-500">
        Don't have an account?{" "}
        <Link href="/register" className="text-emerald-400 hover:text-emerald-300 transition-colors">
          Create one
        </Link>
      </div>

    </main>
  )
}