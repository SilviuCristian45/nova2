"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { formatWeight, kgToUnit, unitToKg, WEIGHT_UNIT_COOKIE, type WeightUnit } from "@/lib/units";
import { useLanguage } from "./language-provider";

type UnitsContextValue = {
  unit: WeightUnit;
  // kg -> number in the user's unit, for inputs and charts
  toUnit: (kg: number) => number;
  // number typed in the user's unit -> kg, for saving
  toKg: (value: number) => number;
  // kg -> "135 lb"
  format: (kg: number) => string;
};

const UnitsContext = createContext<UnitsContextValue | null>(null);

export function UnitsProvider({ initialUnit, children }: { initialUnit: WeightUnit; children: ReactNode }) {
  const { locale } = useLanguage();
  const [unit, setUnit] = useState(initialUnit);
  useEffect(() => {
    // Offline pages come from a cached build; the cookie still has the user's unit.
    async function restoreOfflineUnit() {
      const saved = document.cookie.split("; ").find((entry) => entry.startsWith(`${WEIGHT_UNIT_COOKIE}=`))?.split("=")[1];
      setUnit(saved === "kg" || saved === "lb" ? saved : initialUnit);
    }
    void restoreOfflineUnit();
  }, [initialUnit]);
  const toUnit = useCallback((kg: number) => kgToUnit(kg, unit), [unit]);
  const toKg = useCallback((value: number) => unitToKg(value, unit), [unit]);
  const format = useCallback((kg: number) => formatWeight(kg, unit, locale), [unit, locale]);
  return <UnitsContext.Provider value={{ unit, toUnit, toKg, format }}>{children}</UnitsContext.Provider>;
}

export function useUnits() {
  const context = useContext(UnitsContext);
  if (!context) throw new Error("useUnits must be used within UnitsProvider");
  return context;
}
