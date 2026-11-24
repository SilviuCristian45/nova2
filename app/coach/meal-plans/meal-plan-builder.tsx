"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Copy,
  ListOrdered,
  Loader2,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
  Utensils,
  X,
} from "lucide-react";
import { Text, useLanguage } from "@/app/components/language-provider";
import { FoodLabel } from "@/app/components/food-label";
import { MealPlanExportBar } from "@/app/components/meal-plan-export-bar";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Field,
  IconButton,
  Input,
  Message,
  ProgressBar,
  Segmented,
  Select,
  Textarea,
} from "@/app/components/ui";
import { moveItem } from "@/lib/coach/programs";
import {
  MEAL_PLAN_GOALS,
  MEAL_PLAN_MEAL_TYPES,
  MEAL_PLAN_STATUSES,
  computeDayMacros,
  computeItemMacros,
  computeMealMacros,
  computePlanAverageMacros,
  mealPlanGoalLabel,
  mealPlanStatusLabel,
  mealTypeLabel,
  type MealPlanDayInput,
  type MealPlanDocument,
  type MealPlanGoal,
  type MealPlanItemInput,
  type MealPlanMealInput,
  type MealPlanMealType,
  type MealPlanPayloadInput,
  type MealPlanStatus,
} from "@/lib/coach/meal-plans";
import type { ActiveClientOption } from "./data";
import {
  cloneMealPlanForClientAction,
  deleteMealPlanAction,
  saveMealPlanAction,
  toggleMealPlanShareLinkAction,
} from "./actions";

type DraftItem = MealPlanItemInput & { key: string };
type DraftMeal = Omit<MealPlanMealInput, "items"> & {
  key: string;
  expanded: boolean;
  items: DraftItem[];
};
type DraftDay = Omit<MealPlanDayInput, "meals"> & {
  key: string;
  meals: DraftMeal[];
};

type SearchFoodResult = {
  id?: string;
  barcode?: string;
  name: string;
  brand?: string | null;
  kcal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g?: number | null;
};

let keySeq = 0;
function nextKey(prefix: string) {
  keySeq += 1;
  return `${prefix}-${keySeq}-${Math.random().toString(36).slice(2, 6)}`;
}

function defaultMeal(
  mealType: MealPlanMealType,
  title: string,
  timeLabel = "",
): DraftMeal {
  return {
    key: nextKey("meal"),
    mealType,
    title,
    timeLabel,
    notes: "",
    expanded: true,
    items: [],
  };
}

function defaultDay(
  t: (ro: string, en: string) => string,
  title?: string,
  numbered = false,
): DraftDay {
  return {
    key: nextKey("day"),
    title: title ?? t("Zilnic", "Daily"),
    notes: "",
    meals: numbered
      ? [
          defaultMeal("Meal", t("Masa 1", "Meal 1"), "08:00"),
          defaultMeal("Meal", t("Masa 2", "Meal 2"), "12:00"),
          defaultMeal("Meal", t("Masa 3", "Meal 3"), "16:00"),
          defaultMeal("Meal", t("Masa 4", "Meal 4"), "20:00"),
        ]
      : [
          defaultMeal("Breakfast", t("Mic dejun", "Breakfast"), "08:00"),
          defaultMeal("Lunch", t("Prânz", "Lunch"), "13:00"),
          defaultMeal("Dinner", t("Cină", "Dinner"), "19:30"),
        ],
  };
}

const DEFAULT_MEAL_TITLE_RE = /^(mic dejun|prânz|pranz|cină|cina|gustare|breakfast|lunch|dinner|snack|masa\s+\d+|meal\s+\d+)$/i;

function renumberTitle(existingTitle: string, index: number, t: (ro: string, en: string) => string): string {
  const base = t(`Masa ${index + 1}`, `Meal ${index + 1}`);
  const trimmed = existingTitle.trim();
  if (!trimmed || DEFAULT_MEAL_TITLE_RE.test(trimmed)) return base;
  const dashIdx = trimmed.search(/\s+[—–-]\s+/);
  if (dashIdx > 0) {
    const prefix = trimmed.slice(0, dashIdx).trim();
    const suffix = trimmed.slice(dashIdx);
    if (DEFAULT_MEAL_TITLE_RE.test(prefix)) {
      return `${base}${suffix}`.slice(0, 120);
    }
  }
  return base;
}

function parseOptInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parseOptFloat(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

function FoodAdderPanel({
  onAdd,
  onClose,
}: {
  onAdd: (item: DraftItem) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<"search" | "manual">("search");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchFoodResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [picked, setPicked] = useState<SearchFoodResult | null>(null);
  const [grams, setGrams] = useState("100");
  const [itemNote, setItemNote] = useState("");

  // Manual food state
  const [manualName, setManualName] = useState("");
  const [manualBrand, setManualBrand] = useState("");
  const [manualGrams, setManualGrams] = useState("100");
  const [manualKcal, setManualKcal] = useState("");
  const [manualP, setManualP] = useState("");
  const [manualC, setManualC] = useState("");
  const [manualF, setManualF] = useState("");
  const [manualFiber, setManualFiber] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualErr, setManualErr] = useState<string | null>(null);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setSearchError(null);
    setPicked(null);
    try {
      const res = await fetch(`/api/food/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error || t("Eroare la căutare.", "Search failed."));
        return;
      }
      setResults((data.results ?? []) as SearchFoodResult[]);
      if ((data.results ?? []).length === 0) {
        setSearchError(
          t(
            "Niciun rezultat găsit. Poți adăuga alimentul manual.",
            "No results found. You can add the food manually.",
          ),
        );
      }
    } catch {
      setSearchError(t("Nu am putut căuta alimentul.", "Could not search for food."));
    } finally {
      setSearching(false);
    }
  }

  function confirmPicked() {
    if (!picked) return;
    const g = Number(grams.replace(",", "."));
    if (!Number.isFinite(g) || g <= 0 || g > 10000) {
      setSearchError(t("Introdu un gramaj valid (> 0).", "Enter valid grams (> 0)."));
      return;
    }
    onAdd({
      key: nextKey("item"),
      foodId: picked.id ?? null,
      name: picked.name,
      brand: picked.brand ?? "",
      grams: Math.round(g * 10) / 10,
      kcalPer100g: Number(picked.kcal_per_100g) || 0,
      proteinPer100g: Number(picked.protein_per_100g) || 0,
      carbsPer100g: Number(picked.carbs_per_100g) || 0,
      fatPer100g: Number(picked.fat_per_100g) || 0,
      fiberPer100g:
        picked.fiber_per_100g === null || picked.fiber_per_100g === undefined
          ? null
          : Number(picked.fiber_per_100g),
      notes: itemNote.trim(),
    });
    setPicked(null);
    setGrams("100");
    setItemNote("");
  }

  function confirmManual() {
    setManualErr(null);
    const name = manualName.trim();
    if (!name) {
      setManualErr(t("Introdu numele alimentului.", "Enter a food name."));
      return;
    }
    const g = Number(manualGrams.replace(",", "."));
    const kcal = Number(manualKcal.replace(",", "."));
    const p = manualP.trim() ? Number(manualP.replace(",", ".")) : 0;
    const c = manualC.trim() ? Number(manualC.replace(",", ".")) : 0;
    const f = manualF.trim() ? Number(manualF.replace(",", ".")) : 0;
    const fib = manualFiber.trim() ? Number(manualFiber.replace(",", ".")) : null;

    if (!Number.isFinite(g) || g <= 0 || g > 10000) {
      setManualErr(t("Gramajul trebuie să fie > 0.", "Grams must be > 0."));
      return;
    }
    if (manualKcal.trim() === "" || !Number.isFinite(kcal) || kcal < 0) {
      setManualErr(t("Introdu caloriile per 100g.", "Enter calories per 100g."));
      return;
    }
    if ([p, c, f].some((v) => !Number.isFinite(v) || v < 0) || (fib !== null && (!Number.isFinite(fib) || fib < 0))) {
      setManualErr(t("Valorile macro trebuie să fie numere pozitive.", "Macro values must be positive numbers."));
      return;
    }

    onAdd({
      key: nextKey("item"),
      foodId: null,
      name,
      brand: manualBrand.trim(),
      grams: Math.round(g * 10) / 10,
      kcalPer100g: Math.round(kcal * 100) / 100,
      proteinPer100g: Math.round(p * 100) / 100,
      carbsPer100g: Math.round(c * 100) / 100,
      fatPer100g: Math.round(f * 100) / 100,
      fiberPer100g: fib === null ? null : Math.round(fib * 100) / 100,
      notes: manualNote.trim(),
    });
    setManualName("");
    setManualBrand("");
    setManualGrams("100");
    setManualKcal("");
    setManualP("");
    setManualC("");
    setManualF("");
    setManualFiber("");
    setManualNote("");
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-lime-border bg-card p-3.5">
      <div className="flex items-center justify-between gap-2">
        <Segmented
          inCard
          label={t("Mod adăugare aliment", "Food add mode")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "search", label: t("Caută aliment", "Search food"), icon: Search },
            { value: "manual", label: t("Manual (per 100g)", "Manual (per 100g)"), icon: Plus },
          ]}
        />
        <IconButton plain icon={X} label={t("Închide", "Close")} onClick={onClose} />
      </div>

      {mode === "search" ? (
        <div className="flex flex-col gap-2.5">
          <form onSubmit={runSearch} className="flex items-center gap-2">
            <Input
              compact
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Caută ex: piept de pui, ovăz, orez...", "Search e.g. chicken breast, oats, rice...")}
            />
            <Button type="submit" small icon={Search} busy={searching}>
              <Text ro="Caută" en="Search" />
            </Button>
          </form>

          {searching && (
            <div className="flex items-center justify-center py-3 text-lime-text">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}

          {searchError && <Message>{searchError}</Message>}

          {picked && (
            <div className="flex flex-col gap-2.5 rounded-md bg-lime-soft p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground"><FoodLabel value={picked.name} /></p>
                  <p className="text-xs text-soft tabular-nums">
                    {picked.kcal_per_100g} kcal · P {picked.protein_per_100g}g · C {picked.carbs_per_100g}g · {t("G", "F")} {picked.fat_per_100g}g / 100g
                  </p>
                </div>
                <IconButton plain icon={X} label={t("Renunță", "Cancel")} onClick={() => setPicked(null)} />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Field label={<Text ro="Gramaj (g)" en="Grams (g)" />}>
                  <Input
                    compact
                    type="number"
                    inputMode="decimal"
                    min="1"
                    value={grams}
                    onChange={(e) => setGrams(e.target.value)}
                  />
                </Field>
                <Field label={<Text ro="Notă opțională" en="Optional note" />} className="sm:col-span-2">
                  <Input
                    compact
                    maxLength={280}
                    value={itemNote}
                    onChange={(e) => setItemNote(e.target.value)}
                    placeholder={t("ex. cântărit crud / sau curcan", "e.g. weighed raw / or turkey")}
                  />
                </Field>
              </div>
              <Button small icon={Plus} onClick={confirmPicked}>
                <Text ro="Adaugă în masă" en="Add to meal" />
              </Button>
            </div>
          )}

          {!picked && results.length > 0 && (
            <div className="flex max-h-60 flex-col overflow-y-auto rounded-md bg-inner">
              {results.map((food, idx) => (
                <button
                  key={food.id || food.barcode || `${food.name}-${idx}`}
                  type="button"
                  onClick={() => setPicked(food)}
                  className={`flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-control ${
                    idx > 0 ? "border-t border-line" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      <FoodLabel value={food.name} />
                    </span>
                    <span className="block text-xs text-muted tabular-nums">
                      {food.kcal_per_100g} kcal · P {food.protein_per_100g}g · C {food.carbs_per_100g}g · {t("G", "F")} {food.fat_per_100g}g / 100g
                    </span>
                  </span>
                  <Plus className="size-4 shrink-0 text-lime-text" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field label={<Text ro="Nume aliment" en="Food name" />} className="sm:col-span-2">
              <Input
                compact
                maxLength={200}
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder={t("ex. Piept de pui la grătar", "e.g. Grilled chicken breast")}
              />
            </Field>
            <Field label={<Text ro="Porție (g)" en="Portion (g)" />}>
              <Input
                compact
                type="number"
                inputMode="decimal"
                value={manualGrams}
                onChange={(e) => setManualGrams(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Field label="Kcal / 100g">
              <Input compact type="number" inputMode="decimal" value={manualKcal} onChange={(e) => setManualKcal(e.target.value)} placeholder="165" />
            </Field>
            <Field label="P / 100g">
              <Input compact type="number" inputMode="decimal" value={manualP} onChange={(e) => setManualP(e.target.value)} placeholder="31" />
            </Field>
            <Field label="C / 100g">
              <Input compact type="number" inputMode="decimal" value={manualC} onChange={(e) => setManualC(e.target.value)} placeholder="0" />
            </Field>
            <Field label={`${t("G", "F")} / 100g`}>
              <Input compact type="number" inputMode="decimal" value={manualF} onChange={(e) => setManualF(e.target.value)} placeholder="3.6" />
            </Field>
            <Field label={`${t("Fibre", "Fiber")} / 100g`}>
              <Input compact type="number" inputMode="decimal" value={manualFiber} onChange={(e) => setManualFiber(e.target.value)} placeholder="–" />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label={<Text ro="Brand (opțional)" en="Brand (optional)" />}>
              <Input compact maxLength={120} value={manualBrand} onChange={(e) => setManualBrand(e.target.value)} />
            </Field>
            <Field label={<Text ro="Notă (opțional)" en="Note (optional)" />}>
              <Input
                compact
                maxLength={280}
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                placeholder={t("ex. cântărit crud", "e.g. weighed raw")}
              />
            </Field>
          </div>
          {manualErr && <Message>{manualErr}</Message>}
          <Button small icon={Plus} onClick={confirmManual}>
            <Text ro="Adaugă alimentul" en="Add food" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function MealPlanBuilder({
  initial,
  coachName,
  clients,
  preselectedClientId = null,
}: {
  initial: MealPlanDocument | null;
  coachName: string;
  clients: ActiveClientOption[];
  preselectedClientId?: string | null;
}) {
  const router = useRouter();
  const { t } = useLanguage();

  const [tab, setTab] = useState<"details" | "meals" | "export">(initial ? "meals" : "details");

  // Plan details state
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [goal, setGoal] = useState<MealPlanGoal>(initial?.goal ?? "maintenance");
  const [status, setStatus] = useState<MealPlanStatus>(
    initial?.status ?? (preselectedClientId ? "active" : "draft"),
  );
  const [assignedClientId, setAssignedClientId] = useState<string>(
    initial?.assignedClientId ?? preselectedClientId ?? "",
  );
  const [targetKcal, setTargetKcal] = useState(initial?.targetKcal?.toString() ?? "");
  const [targetProteinG, setTargetProteinG] = useState(initial?.targetProteinG?.toString() ?? "");
  const [targetCarbsG, setTargetCarbsG] = useState(initial?.targetCarbsG?.toString() ?? "");
  const [targetFatG, setTargetFatG] = useState(initial?.targetFatG?.toString() ?? "");
  const [targetFiberG, setTargetFiberG] = useState(initial?.targetFiberG?.toString() ?? "");
  const [waterLiters, setWaterLiters] = useState(initial?.waterLiters?.toString() ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [notifyOnSave, setNotifyOnSave] = useState(false);

  // Days & Meals state
  const [days, setDays] = useState<DraftDay[]>(() => {
    if (initial && initial.days.length > 0) {
      return initial.days.map((d) => ({
        id: d.id,
        key: d.id || nextKey("day"),
        title: d.title,
        notes: d.notes ?? "",
        meals: d.meals.map((m, idx) => ({
          id: m.id,
          key: m.id || nextKey("meal"),
          mealType: m.mealType,
          title: m.title,
          timeLabel: m.timeLabel ?? "",
          notes: m.notes ?? "",
          expanded: idx === 0,
          items: m.items.map((it) => ({
            id: it.id,
            key: it.id || nextKey("item"),
            foodId: it.foodId,
            name: it.name,
            brand: it.brand ?? "",
            grams: it.grams,
            kcalPer100g: it.kcalPer100g,
            proteinPer100g: it.proteinPer100g,
            carbsPer100g: it.carbsPer100g,
            fatPer100g: it.fatPer100g,
            fiberPer100g: it.fiberPer100g,
            notes: it.notes ?? "",
          })),
        })),
      }));
    }
    return [defaultDay(t)];
  });

  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [adderMealKey, setAdderMealKey] = useState<string | null>(null);

  // Clone to client state (for templates)
  const [cloneClientId, setCloneClientId] = useState<string>(clients[0]?.id ?? "");
  const [cloning, setCloning] = useState(false);

  // Save / Delete state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const safeDayIndex = Math.min(activeDayIndex, Math.max(0, days.length - 1));
  const activeDay = days[safeDayIndex];
  const activeDayMacros = activeDay ? computeDayMacros(activeDay.meals) : { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  const planAvgMacros = computePlanAverageMacros(days);

  const parsedTargetKcal = parseOptInt(targetKcal);
  const parsedTargetP = parseOptInt(targetProteinG);
  const parsedTargetC = parseOptInt(targetCarbsG);
  const parsedTargetF = parseOptInt(targetFatG);
  const parsedTargetFiber = parseOptInt(targetFiberG);
  const parsedWater = parseOptFloat(waterLiters);

  const assignedClientName = assignedClientId
    ? (clients.find((c) => c.id === assignedClientId)?.name ?? initial?.clientName ?? null)
    : null;

  // Build live MealPlanDocument for immediate PDF export / text copy!
  const liveDocument: MealPlanDocument = {
    id: initial?.id ?? "draft",
    title: title.trim() || t("Plan alimentar", "Meal plan"),
    description: description.trim() || null,
    goal,
    status,
    targetKcal: parsedTargetKcal,
    targetProteinG: parsedTargetP,
    targetCarbsG: parsedTargetC,
    targetFatG: parsedTargetF,
    targetFiberG: parsedTargetFiber,
    waterLiters: parsedWater,
    notes: notes.trim() || null,
    coachName,
    clientName: assignedClientName,
    assignedClientId: assignedClientId || null,
    shareToken: initial?.shareToken ?? null,
    updatedAt: initial?.updatedAt ?? new Date().toISOString(),
    days: days.map((d, di) => ({
      id: d.id ?? d.key,
      position: di + 1,
      title: d.title.trim() || `${t("Ziua", "Day")} ${di + 1}`,
      notes: d.notes.trim() || null,
      meals: d.meals.map((m, mi) => ({
        id: m.id ?? m.key,
        position: mi + 1,
        mealType: m.mealType,
        title: m.title.trim() || mealTypeLabel(m.mealType, t, mi + 1),
        timeLabel: m.timeLabel.trim() || null,
        notes: m.notes.trim() || null,
        items: m.items.map((it, ii) => ({
          id: it.id ?? it.key,
          position: ii + 1,
          foodId: it.foodId,
          name: it.name,
          brand: it.brand.trim() || null,
          grams: it.grams,
          kcalPer100g: it.kcalPer100g,
          proteinPer100g: it.proteinPer100g,
          carbsPer100g: it.carbsPer100g,
          fatPer100g: it.fatPer100g,
          fiberPer100g: it.fiberPer100g,
          notes: it.notes.trim() || null,
        })),
      })),
    })),
  };

  function updateDay(index: number, updater: (d: DraftDay) => DraftDay) {
    setDays((prev) => prev.map((d, i) => (i === index ? updater(d) : d)));
  }

  function addDay(presetTitle?: string) {
    if (days.length >= 14) return;
    const label = presetTitle ?? `${t("Ziua", "Day")} ${days.length + 1}`;
    const useNumbered = Boolean(activeDay && activeDay.meals.length > 0 && activeDay.meals.every((m) => m.mealType === "Meal"));
    const next = defaultDay(t, label, useNumbered);
    setDays((prev) => [...prev, next]);
    setActiveDayIndex(days.length);
  }

  function duplicateActiveDay() {
    if (!activeDay || days.length >= 14) return;
    const copy: DraftDay = {
      key: nextKey("day"),
      title: `${activeDay.title} (${t("copie", "copy")})`.slice(0, 80),
      notes: activeDay.notes,
      meals: activeDay.meals.map((m) => ({
        ...m,
        id: undefined,
        key: nextKey("meal"),
        items: m.items.map((it) => ({ ...it, id: undefined, key: nextKey("item") })),
      })),
    };
    setDays((prev) => {
      const next = [...prev];
      next.splice(safeDayIndex + 1, 0, copy);
      return next;
    });
    setActiveDayIndex(safeDayIndex + 1);
  }

  function removeActiveDay() {
    if (days.length <= 1) return;
    setDays((prev) => prev.filter((_, i) => i !== safeDayIndex));
    setActiveDayIndex(Math.max(0, safeDayIndex - 1));
  }

  function addMealToActiveDay(type: MealPlanMealType = "Meal") {
    const nextNumber = (activeDay?.meals.length ?? 0) + 1;
    const label = mealTypeLabel(type, t, nextNumber);
    const created = defaultMeal(type, label);
    updateDay(safeDayIndex, (d) => ({
      ...d,
      meals: [...d.meals.map((m) => ({ ...m, expanded: false })), created],
    }));
    setAdderMealKey(created.key);
  }

  function numberAllMealsInActiveDay() {
    updateDay(safeDayIndex, (d) => ({
      ...d,
      meals: d.meals.map((m, idx) => ({
        ...m,
        mealType: "Meal",
        title: renumberTitle(m.title, idx, t),
      })),
    }));
  }

  function duplicateMeal(mealIdx: number) {
    if (!activeDay) return;
    const src = activeDay.meals[mealIdx];
    if (!src) return;
    const copy: DraftMeal = {
      ...src,
      id: undefined,
      key: nextKey("meal"),
      title: `${src.title} (${t("var. 2", "opt. 2")})`.slice(0, 120),
      expanded: true,
      items: src.items.map((it) => ({ ...it, id: undefined, key: nextKey("item") })),
    };
    updateDay(safeDayIndex, (d) => {
      const next = [...d.meals];
      next.splice(mealIdx + 1, 0, copy);
      return { ...d, meals: next };
    });
  }

  function fillTargetsFromPlan() {
    if (planAvgMacros.kcal >= 500) setTargetKcal(String(planAvgMacros.kcal));
    setTargetProteinG(String(planAvgMacros.protein));
    setTargetCarbsG(String(planAvgMacros.carbs));
    setTargetFatG(String(planAvgMacros.fat));
    if (planAvgMacros.fiber > 0) setTargetFiberG(String(planAvgMacros.fiber));
  }

  async function handleSave() {
    setError(null);
    setSavedMsg(null);
    setSaving(true);
    try {
      const payload: MealPlanPayloadInput = {
        id: initial?.id,
        assignedClientId: assignedClientId || null,
        title,
        description,
        goal,
        status,
        targetKcal: parsedTargetKcal,
        targetProteinG: parsedTargetP,
        targetCarbsG: parsedTargetC,
        targetFatG: parsedTargetF,
        targetFiberG: parsedTargetFiber,
        waterLiters: parsedWater,
        notes,
        days: days.map((d) => ({
          id: d.id,
          title: d.title,
          notes: d.notes,
          meals: d.meals.map((m) => ({
            id: m.id,
            mealType: m.mealType,
            title: m.title,
            timeLabel: m.timeLabel,
            notes: m.notes,
            items: m.items.map((it) => ({
              id: it.id,
              foodId: it.foodId,
              name: it.name,
              brand: it.brand,
              grams: it.grams,
              kcalPer100g: it.kcalPer100g,
              proteinPer100g: it.proteinPer100g,
              carbsPer100g: it.carbsPer100g,
              fatPer100g: it.fatPer100g,
              fiberPer100g: it.fiberPer100g,
              notes: it.notes,
            })),
          })),
        })),
      };

      const res = await saveMealPlanAction(payload, { notifyClient: notifyOnSave });
      if (res.error) {
        setError(res.error);
        return;
      }
      setSavedMsg(t("Planul alimentar a fost salvat.", "Meal plan saved successfully."));
      setNotifyOnSave(false);
      if (!initial?.id && res.planId) {
        router.replace(`/coach/meal-plans/${res.planId}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Eroare la salvare.", "Failed to save."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial?.id) return;
    setDeleting(true);
    setError(null);
    const res = await deleteMealPlanAction(initial.id);
    if (res.error) {
      setError(res.error);
      setDeleting(false);
      return;
    }
    router.push("/coach/meal-plans");
  }

  async function handleCloneForClient() {
    if (!initial?.id || !cloneClientId) return;
    setCloning(true);
    setError(null);
    try {
      const res = await cloneMealPlanForClientAction(initial.id, cloneClientId);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.planId) {
        router.push(`/coach/meal-plans/${res.planId}`);
      }
    } finally {
      setCloning(false);
    }
  }

  const totalMealsCount = days.reduce((sum, d) => sum + d.meals.length, 0);

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <Segmented
        label={t("Secțiune plan alimentar", "Meal plan section")}
        value={tab}
        onChange={setTab}
        options={[
          { value: "details", label: t("Detalii & Ținte", "Details & Targets") },
          { value: "meals", label: `${t("Zile & Mese", "Days & Meals")} (${totalMealsCount})` },
          { value: "export", label: t("Export & Share", "Export & Share") },
        ]}
      />

      {error && <Message>{error}</Message>}
      {savedMsg && <Message tone="lime">{savedMsg}</Message>}

      {/* TAB 1: Details & Macro Targets */}
      {tab === "details" && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle
              description={
                <Text
                  ro="Configurează titlul, obiectivul și dacă planul este un șablon reutilizabil sau asignat unui client."
                  en="Configure title, goal, and whether this is a reusable template or assigned to a client."
                />
              }
            >
              <Text ro="Detalii plan alimentar" en="Meal plan details" />
            </CardTitle>

            <Field label={<Text ro="Titlu plan" en="Plan title" />} htmlFor="mp-title">
              <Input
                id="mp-title"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("ex. Plan slăbire 2100 kcal — High Protein", "e.g. Fat loss 2100 kcal — High Protein")}
              />
            </Field>

            <Field label={<Text ro="Descriere (opțional)" en="Description (optional)" />} htmlFor="mp-desc">
              <Textarea
                id="mp-desc"
                value={description}
                maxLength={2000}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("Structura planului, preferințe alimentare, recomandări...", "Plan structure, dietary preferences, focus...")}
              />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={<Text ro="Obiectiv" en="Goal" />}>
                <Select
                  title={t("Obiectiv", "Goal")}
                  value={goal}
                  onChange={(v) => setGoal(v as MealPlanGoal)}
                  options={MEAL_PLAN_GOALS.map((g) => ({ value: g, label: mealPlanGoalLabel(g, t) }))}
                />
              </Field>

              <Field label={<Text ro="Asignare client" en="Client assignment" />}>
                <Select
                  searchable
                  title={t("Selectează clientul", "Select client")}
                  value={assignedClientId}
                  onChange={(nextId) => {
                    setAssignedClientId(nextId);
                    if (nextId && status === "draft") setStatus("active");
                  }}
                  options={[
                    { value: "", label: t("Șablon reutilizabil (fără client)", "Reusable template (no client)") },
                    ...clients.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </Field>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="pl-0.5 text-[13px] font-medium text-muted">
                <Text ro="Status" en="Status" />
              </span>
              <Segmented
                inCard
                label={t("Status plan", "Plan status")}
                value={status}
                onChange={setStatus}
                options={MEAL_PLAN_STATUSES.map((s) => ({ value: s, label: mealPlanStatusLabel(s, t) }))}
              />
              <p className="text-xs text-muted">
                {assignedClientId ? (
                  <Text
                    ro="Clientul vede planul în aplicație doar când statusul este „Activ”."
                    en="The client sees this plan in the app only while its status is Active."
                  />
                ) : (
                  <Text
                    ro="Șabloanele pot fi clonate și personalizate pentru orice client activ."
                    en="Templates can be cloned and customized for any active client."
                  />
                )}
              </p>
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <CardTitle
                description={
                  <Text
                    ro="Țintele zilnice afișate clientului și pe PDF. Clientul le poate aplica cu 1 click ca obiective zilnice."
                    en="Daily targets shown to the client and on the PDF. Clients can apply them to their daily goals in 1 click."
                  />
                }
              >
                <Text ro="Ținte zilnice & Hidratare" en="Daily targets & Hydration" />
              </CardTitle>
              {planAvgMacros.kcal > 0 && (
                <Button variant="secondary" small icon={Sparkles} onClick={fillTargetsFromPlan}>
                  <Text ro="Preia din media meselor" en="Auto-fill from meals" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label={<Text ro="Calorii (kcal)" en="Calories (kcal)" />} htmlFor="mp-kcal">
                <Input
                  id="mp-kcal"
                  type="number"
                  inputMode="numeric"
                  placeholder={planAvgMacros.kcal ? String(planAvgMacros.kcal) : "2200"}
                  value={targetKcal}
                  onChange={(e) => setTargetKcal(e.target.value)}
                />
              </Field>
              <Field label={<Text ro="Proteine (g)" en="Protein (g)" />} htmlFor="mp-p">
                <Input
                  id="mp-p"
                  type="number"
                  inputMode="numeric"
                  placeholder={planAvgMacros.protein ? String(planAvgMacros.protein) : "160"}
                  value={targetProteinG}
                  onChange={(e) => setTargetProteinG(e.target.value)}
                />
              </Field>
              <Field label={<Text ro="Carbohidrați (g)" en="Carbs (g)" />} htmlFor="mp-c">
                <Input
                  id="mp-c"
                  type="number"
                  inputMode="numeric"
                  placeholder={planAvgMacros.carbs ? String(planAvgMacros.carbs) : "220"}
                  value={targetCarbsG}
                  onChange={(e) => setTargetCarbsG(e.target.value)}
                />
              </Field>
              <Field label={<Text ro="Grăsimi (g)" en="Fat (g)" />} htmlFor="mp-f">
                <Input
                  id="mp-f"
                  type="number"
                  inputMode="numeric"
                  placeholder={planAvgMacros.fat ? String(planAvgMacros.fat) : "65"}
                  value={targetFatG}
                  onChange={(e) => setTargetFatG(e.target.value)}
                />
              </Field>
              <Field label={<Text ro="Fibre (g)" en="Fiber (g)" />} htmlFor="mp-fib">
                <Input
                  id="mp-fib"
                  type="number"
                  inputMode="numeric"
                  placeholder="30"
                  value={targetFiberG}
                  onChange={(e) => setTargetFiberG(e.target.value)}
                />
              </Field>
              <Field label={<Text ro="Apă (L / zi)" en="Water (L / day)" />} htmlFor="mp-water">
                <Input
                  id="mp-water"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  placeholder="2.5"
                  value={waterLiters}
                  onChange={(e) => setWaterLiters(e.target.value)}
                />
              </Field>
            </div>

            <Field label={<Text ro="Recomandări generale (suplimente, gătit, înlocuiri)" en="General guidelines (supplements, cooking, swaps)" />} htmlFor="mp-notes">
              <Textarea
                id="mp-notes"
                value={notes}
                maxLength={3000}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t(
                  "ex. Alimentele se cântăresc crude. Creatină 5g/zi, Vitamina D3 2000 UI...",
                  "e.g. Weigh foods raw. Creatine 5g/day, Vitamin D3 2000 IU...",
                )}
              />
            </Field>
          </Card>
        </div>
      )}

      {/* TAB 2: Days & Meals */}
      {tab === "meals" && activeDay && (
        <div className="flex flex-col gap-4">
          {/* Day selector strip */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {days.map((d, idx) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setActiveDayIndex(idx)}
                    className={`min-h-9 rounded-full px-3.5 text-xs font-semibold transition-colors ${
                      idx === safeDayIndex ? "bg-lime text-on-solid" : "bg-inner text-soft"
                    }`}
                  >
                    {d.title || `${t("Ziua", "Day")} ${idx + 1}`}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {days.length === 1 && (
                  <>
                    <Button
                      variant="secondary"
                      small
                      icon={Plus}
                      onClick={() => addDay(t("Zi antrenament", "Training day"))}
                    >
                      <Text ro="+ Zi antrenament" en="+ Training day" />
                    </Button>
                    <Button
                      variant="secondary"
                      small
                      icon={Plus}
                      onClick={() => addDay(t("Zi pauză", "Rest day"))}
                    >
                      <Text ro="+ Zi pauză" en="+ Rest day" />
                    </Button>
                  </>
                )}
                {days.length > 1 && days.length < 14 && (
                  <Button variant="secondary" small icon={Plus} onClick={() => addDay()}>
                    <Text ro="Adaugă zi" en="Add day" />
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Field label={<Text ro="Nume zi" en="Day name" />}>
                <Input
                  compact
                  maxLength={80}
                  value={activeDay.title}
                  onChange={(e) =>
                    updateDay(safeDayIndex, (d) => ({ ...d, title: e.target.value }))
                  }
                  placeholder={t("ex. Zilnic / Zi antrenament / Luni", "e.g. Daily / Training day / Monday")}
                />
              </Field>
              <Field label={<Text ro="Notă pentru această zi (opțional)" en="Day note (optional)" />}>
                <Input
                  compact
                  maxLength={1000}
                  value={activeDay.notes}
                  onChange={(e) =>
                    updateDay(safeDayIndex, (d) => ({ ...d, notes: e.target.value }))
                  }
                  placeholder={t("ex. Carbohidrați mai ridicați în jurul antrenamentului", "e.g. Higher carbs around workout")}
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                <Button variant="secondary" small icon={ListOrdered} onClick={numberAllMealsInActiveDay}>
                  <Text ro="Numerotează mesele (Masa 1, 2, 3...)" en="Number meals (Meal 1, 2, 3...)" />
                </Button>
                <Button variant="outline" small icon={Copy} disabled={days.length >= 14} onClick={duplicateActiveDay}>
                  <Text ro="Duplică ziua" en="Duplicate day" />
                </Button>
                {days.length > 1 && (
                  <Button variant="outline" tone="red" small icon={Trash2} onClick={removeActiveDay}>
                    <Text ro="Șterge ziua" en="Delete day" />
                  </Button>
                )}
              </div>
              <span className="text-xs text-muted">
                {days.length} / 14 {t("zile", "days")}
              </span>
            </div>
          </Card>

          {/* Live Day Macro Totals vs Targets */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">
                <Text ro="Total calculat" en="Computed total" /> · {activeDay.title}
              </span>
              <Badge tone="lime" className="tabular-nums">
                {activeDayMacros.kcal}
                {parsedTargetKcal ? ` / ${parsedTargetKcal}` : ""} kcal
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="flex flex-col gap-1 rounded-md bg-inner p-2.5">
                <div className="flex justify-between text-xs font-semibold tabular-nums">
                  <span className="text-muted">Kcal</span>
                  <span>
                    {activeDayMacros.kcal}
                    {parsedTargetKcal ? ` / ${parsedTargetKcal}` : ""}
                  </span>
                </div>
                {parsedTargetKcal && (
                  <ProgressBar value={(activeDayMacros.kcal / Math.max(1, parsedTargetKcal)) * 100} tone="lime" />
                )}
              </div>
              <div className="flex flex-col gap-1 rounded-md bg-inner p-2.5">
                <div className="flex justify-between text-xs font-semibold tabular-nums">
                  <span className="text-ice-text">P</span>
                  <span>
                    {activeDayMacros.protein}g
                    {parsedTargetP !== null ? ` / ${parsedTargetP}g` : ""}
                  </span>
                </div>
                {parsedTargetP !== null && parsedTargetP > 0 && (
                  <ProgressBar value={(activeDayMacros.protein / parsedTargetP) * 100} tone="ice" />
                )}
              </div>
              <div className="flex flex-col gap-1 rounded-md bg-inner p-2.5">
                <div className="flex justify-between text-xs font-semibold tabular-nums">
                  <span className="text-gold-text">C</span>
                  <span>
                    {activeDayMacros.carbs}g
                    {parsedTargetC !== null ? ` / ${parsedTargetC}g` : ""}
                  </span>
                </div>
                {parsedTargetC !== null && parsedTargetC > 0 && (
                  <ProgressBar value={(activeDayMacros.carbs / parsedTargetC) * 100} tone="gold" />
                )}
              </div>
              <div className="flex flex-col gap-1 rounded-md bg-inner p-2.5">
                <div className="flex justify-between text-xs font-semibold tabular-nums">
                  <span className="text-coral-text">{t("G", "F")}</span>
                  <span>
                    {activeDayMacros.fat}g
                    {parsedTargetF !== null ? ` / ${parsedTargetF}g` : ""}
                  </span>
                </div>
                {parsedTargetF !== null && parsedTargetF > 0 && (
                  <ProgressBar value={(activeDayMacros.fat / parsedTargetF) * 100} tone="coral" />
                )}
              </div>
            </div>
          </Card>

          {/* Meals list */}
          {activeDay.meals.map((meal, mealIdx) => {
            const mealMacros = computeMealMacros(meal.items);
            const showAdder = adderMealKey === meal.key;

            return (
              <Card key={meal.key} padded={false}>
                {/* Meal header */}
                <div className="flex items-center gap-2 px-4 py-3">
                  <button
                    type="button"
                    onClick={() =>
                      updateDay(safeDayIndex, (d) => ({
                        ...d,
                        meals: d.meals.map((m) =>
                          m.key === meal.key ? { ...m, expanded: !m.expanded } : m,
                        ),
                      }))
                    }
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <Badge tone="lime">{mealTypeLabel(meal.mealType, t, mealIdx + 1)}</Badge>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-semibold">
                        {meal.title || mealTypeLabel(meal.mealType, t, mealIdx + 1)}
                        {meal.timeLabel ? ` · ${meal.timeLabel}` : ""}
                      </span>
                      <span className="text-xs text-muted tabular-nums">
                        {mealMacros.kcal} kcal · P {mealMacros.protein}g · C {mealMacros.carbs}g · {t("G", "F")} {mealMacros.fat}g · {meal.items.length}{" "}
                        {t(meal.items.length === 1 ? "aliment" : "alimente", meal.items.length === 1 ? "food" : "foods")}
                      </span>
                    </span>
                    {meal.expanded ? (
                      <ChevronUp className="size-4 text-muted" />
                    ) : (
                      <ChevronDown className="size-4 text-muted" />
                    )}
                  </button>

                  <div className="flex items-center gap-0.5">
                    <IconButton
                      icon={ArrowUp}
                      plain
                      disabled={mealIdx <= 0}
                      label={t("Mută masa sus", "Move meal up")}
                      onClick={() =>
                        updateDay(safeDayIndex, (d) => ({
                          ...d,
                          meals: moveItem(d.meals, mealIdx, "up"),
                        }))
                      }
                    />
                    <IconButton
                      icon={ArrowDown}
                      plain
                      disabled={mealIdx >= activeDay.meals.length - 1}
                      label={t("Mută masa jos", "Move meal down")}
                      onClick={() =>
                        updateDay(safeDayIndex, (d) => ({
                          ...d,
                          meals: moveItem(d.meals, mealIdx, "down"),
                        }))
                      }
                    />
                    <IconButton
                      icon={Copy}
                      plain
                      label={t("Duplică masa", "Duplicate meal")}
                      onClick={() => duplicateMeal(mealIdx)}
                    />
                    <IconButton
                      icon={Trash2}
                      plain
                      tone="red"
                      label={t("Șterge masa", "Delete meal")}
                      onClick={() =>
                        updateDay(safeDayIndex, (d) => ({
                          ...d,
                          meals: d.meals.filter((m) => m.key !== meal.key),
                        }))
                      }
                    />
                  </div>
                </div>

                {meal.expanded && (
                  <div className="flex flex-col gap-3.5 border-t border-line px-4 pb-4 pt-3.5">
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
                      <Field label={<Text ro="Tip masă" en="Meal type" />}>
                        <Select
                          title={t("Tip masă", "Meal type")}
                          value={meal.mealType}
                          onChange={(v) => {
                            const nextType = v as MealPlanMealType;
                            updateDay(safeDayIndex, (d) => ({
                              ...d,
                              meals: d.meals.map((m, idx) => {
                                if (m.key !== meal.key) return m;
                                const nextTitle =
                                  !m.title.trim() || DEFAULT_MEAL_TITLE_RE.test(m.title.trim())
                                    ? mealTypeLabel(nextType, t, idx + 1)
                                    : m.title;
                                return { ...m, mealType: nextType, title: nextTitle };
                              }),
                            }));
                          }}
                          options={MEAL_PLAN_MEAL_TYPES.map((mt) => ({
                            value: mt,
                            label: mealTypeLabel(mt, t, mt === "Meal" ? mealIdx + 1 : undefined),
                          }))}
                        />
                      </Field>
                      <Field label={<Text ro="Titlu masă" en="Meal title" />} className="sm:col-span-2">
                        <Input
                          compact
                          maxLength={120}
                          value={meal.title}
                          onChange={(e) =>
                            updateDay(safeDayIndex, (d) => ({
                              ...d,
                              meals: d.meals.map((m) =>
                                m.key === meal.key ? { ...m, title: e.target.value } : m,
                              ),
                            }))
                          }
                          placeholder={t("ex. Masa 1 / Pre-workout / Mic dejun", "e.g. Meal 1 / Pre-workout / Breakfast")}
                        />
                      </Field>
                      <Field label={<Text ro="Ora / Moment" en="Time / Timing" />}>
                        <Input
                          compact
                          maxLength={30}
                          value={meal.timeLabel}
                          onChange={(e) =>
                            updateDay(safeDayIndex, (d) => ({
                              ...d,
                              meals: d.meals.map((m) =>
                                m.key === meal.key ? { ...m, timeLabel: e.target.value } : m,
                              ),
                            }))
                          }
                          placeholder={t("ex. 08:00", "e.g. 08:00")}
                        />
                      </Field>
                    </div>

                    {/* Items inside meal */}
                    {meal.items.length > 0 && (
                      <div className="flex flex-col gap-2">
                        {meal.items.map((item, itemIdx) => {
                          const m = computeItemMacros(item);
                          return (
                            <div
                              key={item.key}
                              className="flex flex-col gap-2 rounded-md bg-inner p-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-foreground">
                                    <FoodLabel value={item.name} />
                                  </p>
                                  <p className="text-xs text-muted tabular-nums">
                                    <span className="font-semibold text-foreground">{m.kcal} kcal</span> ·{" "}
                                    <span className="text-ice-text">P {m.protein}g</span> ·{" "}
                                    <span className="text-gold-text">C {m.carbs}g</span> ·{" "}
                                    <span className="text-coral-text">{t("G", "F")} {m.fat}g</span>
                                  </p>
                                </div>
                                <div className="flex items-center gap-0.5">
                                  <IconButton
                                    icon={ArrowUp}
                                    plain
                                    disabled={itemIdx <= 0}
                                    label={t("Sus", "Up")}
                                    onClick={() =>
                                      updateDay(safeDayIndex, (d) => ({
                                        ...d,
                                        meals: d.meals.map((mm) =>
                                          mm.key === meal.key
                                            ? { ...mm, items: moveItem(mm.items, itemIdx, "up") }
                                            : mm,
                                        ),
                                      }))
                                    }
                                  />
                                  <IconButton
                                    icon={ArrowDown}
                                    plain
                                    disabled={itemIdx >= meal.items.length - 1}
                                    label={t("Jos", "Down")}
                                    onClick={() =>
                                      updateDay(safeDayIndex, (d) => ({
                                        ...d,
                                        meals: d.meals.map((mm) =>
                                          mm.key === meal.key
                                            ? { ...mm, items: moveItem(mm.items, itemIdx, "down") }
                                            : mm,
                                        ),
                                      }))
                                    }
                                  />
                                  <IconButton
                                    icon={Trash2}
                                    plain
                                    tone="red"
                                    label={t("Șterge alimentul", "Remove food")}
                                    onClick={() =>
                                      updateDay(safeDayIndex, (d) => ({
                                        ...d,
                                        meals: d.meals.map((mm) =>
                                          mm.key === meal.key
                                            ? { ...mm, items: mm.items.filter((x) => x.key !== item.key) }
                                            : mm,
                                        ),
                                      }))
                                    }
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                                <Field label={<Text ro="Grame" en="Grams" />}>
                                  <Input
                                    compact
                                    type="number"
                                    inputMode="decimal"
                                    min="1"
                                    value={item.grams}
                                    onChange={(e) => {
                                      const nextG = Math.max(0.1, Number(e.target.value) || 0);
                                      updateDay(safeDayIndex, (d) => ({
                                        ...d,
                                        meals: d.meals.map((mm) =>
                                          mm.key === meal.key
                                            ? {
                                                ...mm,
                                                items: mm.items.map((x) =>
                                                  x.key === item.key ? { ...x, grams: nextG } : x,
                                                ),
                                              }
                                            : mm,
                                        ),
                                      }));
                                    }}
                                  />
                                </Field>
                                <Field label={<Text ro="Notă / Înlocuitor (opțional)" en="Note / Swap (optional)" />} className="sm:col-span-3">
                                  <Input
                                    compact
                                    maxLength={280}
                                    value={item.notes}
                                    onChange={(e) =>
                                      updateDay(safeDayIndex, (d) => ({
                                        ...d,
                                        meals: d.meals.map((mm) =>
                                          mm.key === meal.key
                                            ? {
                                                ...mm,
                                                items: mm.items.map((x) =>
                                                  x.key === item.key ? { ...x, notes: e.target.value } : x,
                                                ),
                                              }
                                            : mm,
                                        ),
                                      }))
                                    }
                                    placeholder={t("ex. cântărit crud / sau 150g piept curcan", "e.g. weighed raw / or 150g turkey")}
                                  />
                                </Field>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {showAdder ? (
                      <FoodAdderPanel
                        onAdd={(newItem) =>
                          updateDay(safeDayIndex, (d) => ({
                            ...d,
                            meals: d.meals.map((m) =>
                              m.key === meal.key ? { ...m, items: [...m.items, newItem] } : m,
                            ),
                          }))
                        }
                        onClose={() => setAdderMealKey(null)}
                      />
                    ) : (
                      <Button
                        variant="secondary"
                        small
                        icon={Plus}
                        onClick={() => setAdderMealKey(meal.key)}
                      >
                        <Text ro="Adaugă aliment" en="Add food" />
                      </Button>
                    )}

                    <Field label={<Text ro="Indicații / Alternative masă (opțional)" en="Meal instructions / Alternatives (optional)" />}>
                      <Input
                        compact
                        maxLength={1000}
                        value={meal.notes}
                        onChange={(e) =>
                          updateDay(safeDayIndex, (d) => ({
                            ...d,
                            meals: d.meals.map((m) =>
                              m.key === meal.key ? { ...m, notes: e.target.value } : m,
                            ),
                          }))
                        }
                        placeholder={t("ex. Se poate prepara ca omletă sau ouă fierte...", "e.g. Can be prepared as omelette or boiled eggs...")}
                      />
                    </Field>
                  </div>
                )}
              </Card>
            );
          })}

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Utensils className="size-4 text-lime-text" />
                <Text ro="Adaugă o masă nouă" en="Add a new meal" />
              </span>
              <div className="flex flex-wrap gap-1.5">
                {MEAL_PLAN_MEAL_TYPES.map((mt) => (
                  <Button
                    key={mt}
                    variant={mt === "Meal" ? "primary" : "secondary"}
                    small
                    icon={Plus}
                    disabled={activeDay.meals.length >= 12}
                    onClick={() => addMealToActiveDay(mt)}
                  >
                    {mealTypeLabel(mt, t, mt === "Meal" ? activeDay.meals.length + 1 : undefined)}
                  </Button>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: Export, Share & Clone to Client */}
      {tab === "export" && (
        <div className="flex flex-col gap-4">
          <MealPlanExportBar
            plan={liveDocument}
            shareLink={
              initial?.id
                ? {
                    token: initial.shareToken ?? null,
                    onEnable: () => toggleMealPlanShareLinkAction(initial.id, true),
                    onDisable: () => toggleMealPlanShareLinkAction(initial.id, false),
                    onRegenerate: () => toggleMealPlanShareLinkAction(initial.id, true),
                  }
                : undefined
            }
          />

          {!initial?.id && (
            <Message tone="ice">
              <Text
                ro="Salvează planul mai întâi pentru a putea activa un link public read-only sau pentru a-l clona către un client. Exportul PDF și copierea textului funcționează deja pe ciorna curentă."
                en="Save the plan first to enable a read-only public link or clone it to a client. PDF export and copy text already work on the current draft."
              />
            </Message>
          )}

          {initial?.id && !initial.assignedClientId && clients.length > 0 && (
            <Card>
              <CardTitle
                description={
                  <Text
                    ro="Creează o copie activă, personalizabilă a acestui șablon direct pentru un client activ (clientul va primi notificare automat)."
                    en="Creates an active, customizable copy of this template for an active client (notifies the client automatically)."
                  />
                }
              >
                <span className="flex items-center gap-2">
                  <UserPlus className="size-5 text-lime-text" />
                  <Text ro="Clonează & asignează unui client" en="Clone & assign to a client" />
                </span>
              </CardTitle>

              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
                <Field label={<Text ro="Client activ" en="Active client" />} className="flex-1">
                  <Select
                    searchable
                    title={t("Selectează clientul", "Select client")}
                    value={cloneClientId}
                    onChange={setCloneClientId}
                    options={clients.map((c) => ({ value: c.id, label: c.name }))}
                  />
                </Field>
                <Button icon={Copy} busy={cloning} onClick={() => void handleCloneForClient()}>
                  <Text ro="Clonează pentru client" en="Clone for client" />
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Save & Delete footer */}
      <Card className="no-print">
        {initial?.id && initial.assignedClientId && status === "active" && (
          <label className="flex items-center gap-2.5 rounded-md bg-inner px-3.5 py-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={notifyOnSave}
              onChange={(e) => setNotifyOnSave(e.target.checked)}
              className="size-4 accent-[var(--lime)]"
            />
            <Text
              ro="Trimite notificare clientului că planul alimentar a fost actualizat"
              en="Notify the client that their meal plan was updated"
            />
          </label>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button large icon={Save} busy={saving} onClick={() => void handleSave()} className="flex-1">
            {initial?.id ? (
              <Text ro="Salvează modificările" en="Save changes" />
            ) : (
              <Text ro="Salvează planul alimentar" en="Save meal plan" />
            )}
          </Button>

          {initial?.id && !confirmDelete && (
            <Button variant="outline" tone="red" onClick={() => setConfirmDelete(true)}>
              <Text ro="Șterge planul" en="Delete plan" />
            </Button>
          )}
        </div>

        {confirmDelete && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-red-soft p-3 text-sm">
            <span className="font-semibold text-red-text">
              <Text ro="Sigur vrei să ștergi definitiv acest plan alimentar?" en="Permanently delete this meal plan?" />
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" small onClick={() => setConfirmDelete(false)}>
                <Text ro="Anulează" en="Cancel" />
              </Button>
              <Button tone="red" small busy={deleting} onClick={() => void handleDelete()}>
                <Text ro="Confirmă ștergerea" en="Confirm delete" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
