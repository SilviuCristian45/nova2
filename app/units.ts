import { cache } from "react"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { formatWeight, parseWeightUnit, WEIGHT_UNIT_COOKIE, type WeightUnit } from "@/lib/units"

// The cookie mirrors profiles.weight_unit so offline pages know it too; the profile is the fallback.
export const getWeightUnit = cache(async (): Promise<WeightUnit> => {
  const saved = (await cookies()).get(WEIGHT_UNIT_COOKIE)?.value
  if (saved === "kg" || saved === "lb") return saved
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return "kg"
  const { data } = await supabase.from("profiles").select("weight_unit").eq("id", user.id).maybeSingle()
  return parseWeightUnit(data?.weight_unit)
})

export async function getWeightFormatter(locale: string) {
  const unit = await getWeightUnit()
  return { unit, format: (kg: number) => formatWeight(kg, unit, locale) }
}

export async function rememberWeightUnit(unit: WeightUnit) {
  (await cookies()).set(WEIGHT_UNIT_COOKIE, unit, { path: "/", maxAge: 31536000, sameSite: "lax" })
}
