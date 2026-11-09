"use client"

import { Text, useLanguage } from "@/app/components/language-provider"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Save, Loader2 } from "lucide-react"
import { Button, Card, Field, Input, Screen } from "@/app/components/ui"
import { getUserTargets, saveUserTargets } from "@/app/meals/action"
import { EnergyRecommendation } from "./energy-recommendation"

export default function EditTargetsPage() {
  const { t } = useLanguage()

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
      alert(t("Eroare la salvare!", "Could not save!"))
      setIsSaving(false)
    }
  }

  if (isLoading) return <Screen title={<Text ro="Obiective" en="Goals" />} back="/meals/progress"><div role="status" className="flex justify-center py-20 text-lime-text"><Loader2 className="size-8 animate-spin" /></div></Screen>

  const macroField = (key: "protein" | "carbs" | "fat" | "fiber", label: React.ReactNode, text: string) => (
    <Field label={label} htmlFor={`target-${key}`}>
      <Input id={`target-${key}`} big type="number" inputMode="numeric" value={targets[key]}
        onChange={e => setTargets({ ...targets, [key]: Number(e.target.value) })} className={text} />
    </Field>
  )

  return (
    <Screen title={<Text ro="Obiectivele tale" en="Your goals" />} back="/meals/progress">
      <EnergyRecommendation onApply={(recommended) => setTargets(recommended)} />

      <Card>
        <Field label={<Text ro="Total calorii (kcal)" en="Total calories (kcal)" />} htmlFor="target-kcal">
          <Input id="target-kcal" type="number" inputMode="numeric" value={targets.kcal}
            onChange={e => setTargets({ ...targets, kcal: Number(e.target.value) })}
            className="min-h-14 text-[24px] font-bold tabular-nums" />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          {macroField("protein", <Text ro="Proteine (g)" en="Protein (g)" />, "text-lime-text")}
          {macroField("carbs", <Text ro="Carbohidrați (g)" en="Carbohydrates (g)" />, "text-ice-text")}
          {macroField("fat", <Text ro="Grăsimi (g)" en="Fat (g)" />, "text-gold-text")}
          {macroField("fiber", <Text ro="Fibre (g)" en="Fibre (g)" />, "text-lilac-text")}
        </div>
      </Card>

      <Button large icon={Save} onClick={handleSave} busy={isSaving}>
        <Text ro="Salvează obiectivele" en="Save goals" />
      </Button>
    </Screen>
  )
}
