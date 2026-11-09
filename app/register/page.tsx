"use client"

import { Text } from "@/app/components/language-provider"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Dumbbell } from "lucide-react"
import { Button, Card, CardTitle, Field, Input, Message } from "@/app/components/ui"
import { registerUser } from "./actions" // Asigură-te că funcția există în acțiunile tale

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
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 p-5 text-foreground">
      <div className="flex flex-col gap-1.5">
        <span className="flex size-11 items-center justify-center rounded-full bg-lime text-on-solid">
          <Dumbbell className="size-5" />
        </span>
        <h1 className="mt-3 text-[36px] font-bold leading-[40px] tracking-[-1.4px]">RepLog</h1>
        <p className="text-muted">
          <Text ro="Fiecare set contează. Depășește-te la fiecare sesiune." en="Track every set. Beat every session." />
        </p>
      </div>

      <Card>
        <CardTitle description={<Text ro="Înregistrează-te pentru a-ți urmări antrenamentele" en="Sign up to log your training" />}>
          <Text ro="Creează un cont" en="Create an account" />
        </CardTitle>
        <form action={handleAction} className="flex flex-col gap-3.5">
          <Field label={<Text ro="E-mail" en="Email" />} htmlFor="email">
            <Input id="email" name="email" type="email" required autoComplete="email" placeholder="name@example.com" />
          </Field>
          <Field label={<Text ro="Parolă" en="Password" />} htmlFor="password">
            <Input id="password" name="password" type="password" required minLength={6} autoComplete="new-password" placeholder="••••••••" />
          </Field>
          {error && <Message>{error}</Message>}
          <Button type="submit" busy={isPending} className="mt-1">
            {isPending ? <Text ro="Se creează contul..." en="Creating account..." /> : <Text ro="Înregistrare" en="Sign up" />}
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-muted">
        <Text ro="Ai deja un cont?" en="Already have an account?" />{" "}
        <Link href="/login" className="font-semibold text-lime-text">
          <Text ro="Autentificare" en="Sign in" />
        </Link>
      </p>
    </main>
  )
}
