"use client";

import { useLanguage } from "./language-provider";

export function FoodLabel({ value }: { value: string }) {
  const { t } = useLanguage();
  if (value === "Creat Manual") return t("Creat manual", "Custom food");
  if (value === "Fără Brand") return t("Fără marcă", "No brand");
  if (value === "Produs Necunoscut") return t("Produs necunoscut", "Unknown product");
  return value;
}
