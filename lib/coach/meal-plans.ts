export type Translator = (ro: string, en: string) => string;

export const MEAL_PLAN_GOALS = [
  "fat_loss",
  "maintenance",
  "muscle_gain",
  "recomp",
  "performance",
] as const;
export type MealPlanGoal = (typeof MEAL_PLAN_GOALS)[number];

export const MEAL_PLAN_STATUSES = ["draft", "active", "archived"] as const;
export type MealPlanStatus = (typeof MEAL_PLAN_STATUSES)[number];

export const MEAL_PLAN_MEAL_TYPES = ["Meal", "Breakfast", "Lunch", "Dinner", "Snack"] as const;
export type MealPlanMealType = (typeof MEAL_PLAN_MEAL_TYPES)[number];

export type DiaryMealType = "Breakfast" | "Lunch" | "Dinner" | "Snack";

export type MacroTotals = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

export type MealPlanItemInput = {
  id?: string;
  foodId: string | null;
  name: string;
  brand: string;
  grams: number;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number | null;
  notes: string;
};

export type MealPlanMealInput = {
  id?: string;
  mealType: MealPlanMealType;
  title: string;
  timeLabel: string;
  notes: string;
  items: MealPlanItemInput[];
};

export type MealPlanDayInput = {
  id?: string;
  title: string;
  notes: string;
  meals: MealPlanMealInput[];
};

export type MealPlanPayloadInput = {
  id?: string;
  assignedClientId: string | null;
  title: string;
  description: string;
  goal: MealPlanGoal;
  status: MealPlanStatus;
  targetKcal: number | null;
  targetProteinG: number | null;
  targetCarbsG: number | null;
  targetFatG: number | null;
  targetFiberG: number | null;
  waterLiters: number | null;
  notes: string;
  days: MealPlanDayInput[];
};

export type ValidatedMealPlanPayload = Omit<
  MealPlanPayloadInput,
  "title" | "description" | "notes"
> & {
  title: string;
  description: string | null;
  notes: string | null;
};

// Complete normalized plan document used by viewers, PDF export, text export, and public links.
export type MealPlanDocument = {
  id: string;
  title: string;
  description: string | null;
  goal: MealPlanGoal;
  status: MealPlanStatus;
  targetKcal: number | null;
  targetProteinG: number | null;
  targetCarbsG: number | null;
  targetFatG: number | null;
  targetFiberG: number | null;
  waterLiters: number | null;
  notes: string | null;
  coachName: string;
  clientName?: string | null;
  assignedClientId?: string | null;
  shareToken?: string | null;
  updatedAt: string;
  days: {
    id: string;
    position: number;
    title: string;
    notes: string | null;
    meals: {
      id: string;
      position: number;
      mealType: MealPlanMealType;
      title: string;
      timeLabel: string | null;
      notes: string | null;
      items: {
        id: string;
        position: number;
        foodId: string | null;
        name: string;
        brand: string | null;
        grams: number;
        kcalPer100g: number;
        proteinPer100g: number;
        carbsPer100g: number;
        fatPer100g: number;
        fiberPer100g: number | null;
        notes: string | null;
      }[];
    }[];
  }[];
};

const SHARE_TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_";

export function generateShareToken(length = 24): string {
  const safeLength = Math.max(16, Math.min(64, Math.floor(length)));
  const bytes = new Uint8Array(safeLength);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < safeLength; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < safeLength; i++) {
    out += SHARE_TOKEN_ALPHABET[bytes[i] % SHARE_TOKEN_ALPHABET.length];
  }
  return out;
}

export function isValidShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(token);
}

export function mealPlanGoalLabel(goal: MealPlanGoal, t: Translator): string {
  switch (goal) {
    case "fat_loss": return t("Slăbire", "Fat loss");
    case "maintenance": return t("Menținere", "Maintenance");
    case "muscle_gain": return t("Masă musculară", "Muscle gain");
    case "recomp": return t("Recompoziție", "Recomposition");
    case "performance": return t("Performanță", "Performance");
  }
}

export function mealPlanStatusLabel(status: MealPlanStatus, t: Translator): string {
  switch (status) {
    case "draft": return t("Ciornă", "Draft");
    case "active": return t("Activ", "Active");
    case "archived": return t("Arhivat", "Archived");
  }
}

export function mealTypeLabel(type: MealPlanMealType, t: Translator, position?: number): string {
  switch (type) {
    case "Meal":
      return position && position > 0
        ? t(`Masa ${position}`, `Meal ${position}`)
        : t("Masă numerotată", "Numbered meal");
    case "Breakfast": return t("Mic dejun", "Breakfast");
    case "Lunch": return t("Prânz", "Lunch");
    case "Dinner": return t("Cină", "Dinner");
    case "Snack": return t("Gustare", "Snack");
  }
}

// Maps any meal plan meal_type (including numbered 'Meal') to a valid public.meals diary slot.
export function toDiaryMealType(type: MealPlanMealType | string, position = 1): DiaryMealType {
  if (type === "Breakfast" || type === "Lunch" || type === "Dinner" || type === "Snack") {
    return type;
  }
  if (position <= 1) return "Breakfast";
  if (position === 2) return "Lunch";
  if (position === 3) return "Dinner";
  return "Snack";
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeItemMacros(item: {
  grams: number;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g?: number | null;
}): MacroTotals {
  const factor = (Number(item.grams) || 0) / 100;
  return {
    kcal: Math.round((Number(item.kcalPer100g) || 0) * factor),
    protein: round1((Number(item.proteinPer100g) || 0) * factor),
    carbs: round1((Number(item.carbsPer100g) || 0) * factor),
    fat: round1((Number(item.fatPer100g) || 0) * factor),
    fiber: round1((Number(item.fiberPer100g) || 0) * factor),
  };
}

export function computeMealMacros(
  items: readonly {
    grams: number;
    kcalPer100g: number;
    proteinPer100g: number;
    carbsPer100g: number;
    fatPer100g: number;
    fiberPer100g?: number | null;
  }[],
): MacroTotals {
  let kcal = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let fiber = 0;
  for (const item of items) {
    const factor = (Number(item.grams) || 0) / 100;
    kcal += (Number(item.kcalPer100g) || 0) * factor;
    protein += (Number(item.proteinPer100g) || 0) * factor;
    carbs += (Number(item.carbsPer100g) || 0) * factor;
    fat += (Number(item.fatPer100g) || 0) * factor;
    fiber += (Number(item.fiberPer100g) || 0) * factor;
  }
  return {
    kcal: Math.round(kcal),
    protein: round1(protein),
    carbs: round1(carbs),
    fat: round1(fat),
    fiber: round1(fiber),
  };
}

export function computeDayMacros(
  meals: readonly {
    items: readonly {
      grams: number;
      kcalPer100g: number;
      proteinPer100g: number;
      carbsPer100g: number;
      fatPer100g: number;
      fiberPer100g?: number | null;
    }[];
  }[],
): MacroTotals {
  const allItems = meals.flatMap((m) => m.items);
  return computeMealMacros(allItems);
}

export function computePlanAverageMacros(
  days: readonly {
    meals: readonly {
      items: readonly {
        grams: number;
        kcalPer100g: number;
        proteinPer100g: number;
        carbsPer100g: number;
        fatPer100g: number;
        fiberPer100g?: number | null;
      }[];
    }[];
  }[],
): MacroTotals {
  if (days.length === 0) {
    return { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  }
  const totals = days.map((d) => computeDayMacros(d.meals));
  const n = totals.length;
  return {
    kcal: Math.round(totals.reduce((s, x) => s + x.kcal, 0) / n),
    protein: Math.round(totals.reduce((s, x) => s + x.protein, 0) / n),
    carbs: Math.round(totals.reduce((s, x) => s + x.carbs, 0) / n),
    fat: Math.round(totals.reduce((s, x) => s + x.fat, 0) / n),
    fiber: Math.round(totals.reduce((s, x) => s + x.fiber, 0) / n),
  };
}

export function validateMealPlanPayload(
  input: MealPlanPayloadInput,
  t: Translator,
): { ok: true; data: ValidatedMealPlanPayload } | { ok: false; error: string } {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 120) {
    return {
      ok: false,
      error: t(
        "Titlul planului trebuie să aibă între 1 și 120 de caractere.",
        "Meal plan title must be between 1 and 120 characters.",
      ),
    };
  }

  const description = input.description.trim();
  if (description.length > 2000) {
    return {
      ok: false,
      error: t(
        "Descrierea poate avea maxim 2000 de caractere.",
        "Description can have at most 2000 characters.",
      ),
    };
  }

  const notes = input.notes.trim();
  if (notes.length > 3000) {
    return {
      ok: false,
      error: t(
        "Recomandările generale pot avea maxim 3000 de caractere.",
        "General notes can have at most 3000 characters.",
      ),
    };
  }

  if (!MEAL_PLAN_GOALS.includes(input.goal)) {
    return { ok: false, error: t("Obiectiv invalid.", "Invalid goal.") };
  }
  if (!MEAL_PLAN_STATUSES.includes(input.status)) {
    return { ok: false, error: t("Status invalid.", "Invalid status.") };
  }

  const checkOptInt = (val: number | null, min: number, max: number, labelRo: string, labelEn: string) => {
    if (val === null) return null;
    if (!Number.isInteger(val) || val < min || val > max) {
      return t(
        `${labelRo} trebuie să fie între ${min} și ${max}.`,
        `${labelEn} must be between ${min} and ${max}.`,
      );
    }
    return null;
  };

  const targetErr =
    checkOptInt(input.targetKcal, 500, 15000, "Ținta de calorii", "Calorie target") ??
    checkOptInt(input.targetProteinG, 0, 1000, "Ținta de proteine", "Protein target") ??
    checkOptInt(input.targetCarbsG, 0, 2000, "Ținta de carbohidrați", "Carbs target") ??
    checkOptInt(input.targetFatG, 0, 500, "Ținta de grăsimi", "Fat target") ??
    checkOptInt(input.targetFiberG, 0, 200, "Ținta de fibre", "Fiber target");
  if (targetErr) return { ok: false, error: targetErr };

  let waterLiters: number | null = null;
  if (input.waterLiters !== null) {
    if (!Number.isFinite(input.waterLiters) || input.waterLiters < 0.5 || input.waterLiters > 15) {
      return {
        ok: false,
        error: t(
          "Hidratarea trebuie să fie între 0.5 și 15 litri.",
          "Water target must be between 0.5 and 15 liters.",
        ),
      };
    }
    waterLiters = round1(input.waterLiters);
  }

  if (input.days.length < 1 || input.days.length > 14) {
    return {
      ok: false,
      error: t(
        "Planul trebuie să aibă între 1 și 14 zile.",
        "A meal plan must have between 1 and 14 days.",
      ),
    };
  }

  const normalizedDays: MealPlanDayInput[] = [];
  for (let di = 0; di < input.days.length; di++) {
    const day = input.days[di];
    const dTitle = day.title.trim();
    if (dTitle.length < 1 || dTitle.length > 80) {
      return {
        ok: false,
        error: t(
          `Ziua #${di + 1} trebuie să aibă un titlu (1–80 caractere).`,
          `Day #${di + 1} needs a title (1–80 characters).`,
        ),
      };
    }
    if (day.notes.trim().length > 1000) {
      return {
        ok: false,
        error: t(
          `Notițele pentru „${dTitle}” depășesc 1000 de caractere.`,
          `Notes for "${dTitle}" exceed 1000 characters.`,
        ),
      };
    }
    if (day.meals.length > 12) {
      return {
        ok: false,
        error: t(
          `Ziua „${dTitle}” poate avea maxim 12 mese.`,
          `Day "${dTitle}" can have at most 12 meals.`,
        ),
      };
    }

    const normalizedMeals: MealPlanMealInput[] = [];
    for (let mi = 0; mi < day.meals.length; mi++) {
      const meal = day.meals[mi];
      if (!MEAL_PLAN_MEAL_TYPES.includes(meal.mealType)) {
        return { ok: false, error: t("Tip de masă invalid.", "Invalid meal type.") };
      }
      const mTitle = meal.title.trim();
      if (mTitle.length < 1 || mTitle.length > 120) {
        return {
          ok: false,
          error: t(
            `Masa #${mi + 1} din „${dTitle}” trebuie să aibă un titlu (1–120 caractere).`,
            `Meal #${mi + 1} in "${dTitle}" needs a title (1–120 characters).`,
          ),
        };
      }
      const mTime = meal.timeLabel.trim();
      if (mTime.length > 30) {
        return {
          ok: false,
          error: t(
            `Ora pentru „${mTitle}” poate avea maxim 30 de caractere.`,
            `Time label for "${mTitle}" can have at most 30 characters.`,
          ),
        };
      }
      if (meal.notes.trim().length > 1000) {
        return {
          ok: false,
          error: t(
            `Notițele pentru „${mTitle}” depășesc 1000 de caractere.`,
            `Notes for "${mTitle}" exceed 1000 characters.`,
          ),
        };
      }
      if (meal.items.length > 40) {
        return {
          ok: false,
          error: t(
            `Masa „${mTitle}” poate avea maxim 40 de alimente.`,
            `Meal "${mTitle}" can have at most 40 foods.`,
          ),
        };
      }

      const normalizedItems: MealPlanItemInput[] = [];
      for (let ii = 0; ii < meal.items.length; ii++) {
        const item = meal.items[ii];
        const iName = item.name.trim();
        if (iName.length < 1 || iName.length > 200) {
          return {
            ok: false,
            error: t(
              `Alimentul #${ii + 1} din „${mTitle}” are nevoie de un nume (1–200 caractere).`,
              `Food #${ii + 1} in "${mTitle}" needs a name (1–200 characters).`,
            ),
          };
        }
        if (item.brand.trim().length > 120) {
          return {
            ok: false,
            error: t(
              `Brandul pentru „${iName}” depășește 120 de caractere.`,
              `Brand for "${iName}" exceeds 120 characters.`,
            ),
          };
        }
        if (!Number.isFinite(item.grams) || item.grams <= 0 || item.grams > 10000) {
          return {
            ok: false,
            error: t(
              `Gramajul pentru „${iName}” trebuie să fie între 0.1 și 10000 g.`,
              `Grams for "${iName}" must be between 0.1 and 10000 g.`,
            ),
          };
        }
        if (!Number.isFinite(item.kcalPer100g) || item.kcalPer100g < 0 || item.kcalPer100g > 10000) {
          return {
            ok: false,
            error: t(`Caloriile per 100g pentru „${iName}” sunt invalide.`, `Calories per 100g for "${iName}" are invalid.`),
          };
        }
        if (
          !Number.isFinite(item.proteinPer100g) || item.proteinPer100g < 0 || item.proteinPer100g > 1000 ||
          !Number.isFinite(item.carbsPer100g) || item.carbsPer100g < 0 || item.carbsPer100g > 1000 ||
          !Number.isFinite(item.fatPer100g) || item.fatPer100g < 0 || item.fatPer100g > 1000
        ) {
          return {
            ok: false,
            error: t(`Macronutrienții per 100g pentru „${iName}” sunt invalizi.`, `Macros per 100g for "${iName}" are invalid.`),
          };
        }
        if (
          item.fiberPer100g !== null &&
          (!Number.isFinite(item.fiberPer100g) || item.fiberPer100g < 0 || item.fiberPer100g > 1000)
        ) {
          return {
            ok: false,
            error: t(`Fibrele per 100g pentru „${iName}” sunt invalide.`, `Fiber per 100g for "${iName}" are invalid.`),
          };
        }
        if (item.notes.trim().length > 280) {
          return {
            ok: false,
            error: t(
              `Notița pentru „${iName}” poate avea maxim 280 de caractere.`,
              `Note for "${iName}" can have at most 280 characters.`,
            ),
          };
        }

        normalizedItems.push({
          id: item.id,
          foodId: item.foodId || null,
          name: iName,
          brand: item.brand.trim(),
          grams: round1(item.grams),
          kcalPer100g: Math.round(item.kcalPer100g * 100) / 100,
          proteinPer100g: Math.round(item.proteinPer100g * 100) / 100,
          carbsPer100g: Math.round(item.carbsPer100g * 100) / 100,
          fatPer100g: Math.round(item.fatPer100g * 100) / 100,
          fiberPer100g: item.fiberPer100g === null ? null : Math.round(item.fiberPer100g * 100) / 100,
          notes: item.notes.trim(),
        });
      }

      normalizedMeals.push({
        id: meal.id,
        mealType: meal.mealType,
        title: mTitle,
        timeLabel: mTime,
        notes: meal.notes.trim(),
        items: normalizedItems,
      });
    }

    normalizedDays.push({
      id: day.id,
      title: dTitle,
      notes: day.notes.trim(),
      meals: normalizedMeals,
    });
  }

  return {
    ok: true,
    data: {
      id: input.id,
      assignedClientId: input.assignedClientId || null,
      title,
      description: description || null,
      goal: input.goal,
      status: input.status,
      targetKcal: input.targetKcal,
      targetProteinG: input.targetProteinG,
      targetCarbsG: input.targetCarbsG,
      targetFatG: input.targetFatG,
      targetFiberG: input.targetFiberG,
      waterLiters,
      notes: notes || null,
      days: normalizedDays,
    },
  };
}

export function formatMealPlanAsText(
  plan: MealPlanDocument,
  t: Translator,
): string {
  const lines: string[] = [];
  lines.push(`${plan.title.toUpperCase()}`);
  lines.push(`${t("Antrenor", "Coach")}: ${plan.coachName} · ${t("Obiectiv", "Goal")}: ${mealPlanGoalLabel(plan.goal, t)}`);
  if (plan.clientName) {
    lines.push(`${t("Client", "Client")}: ${plan.clientName}`);
  }
  if (plan.description) {
    lines.push("");
    lines.push(plan.description);
  }

  const targetParts: string[] = [];
  if (plan.targetKcal !== null) targetParts.push(`${plan.targetKcal} kcal`);
  if (plan.targetProteinG !== null) targetParts.push(`P ${plan.targetProteinG}g`);
  if (plan.targetCarbsG !== null) targetParts.push(`C ${plan.targetCarbsG}g`);
  if (plan.targetFatG !== null) targetParts.push(`${t("G", "F")} ${plan.targetFatG}g`);
  if (plan.targetFiberG !== null) targetParts.push(`${t("Fibre", "Fiber")} ${plan.targetFiberG}g`);
  if (plan.waterLiters !== null) targetParts.push(`${t("Apă", "Water")} ${plan.waterLiters}L`);

  if (targetParts.length > 0) {
    lines.push("");
    lines.push(`${t("Ținte zilnice", "Daily targets")}: ${targetParts.join(" · ")}`);
  }

  for (const day of plan.days) {
    const dayTotals = computeDayMacros(day.meals);
    lines.push("");
    lines.push(`=== ${day.title} (${dayTotals.kcal} kcal · P ${dayTotals.protein}g · C ${dayTotals.carbs}g · ${t("G", "F")} ${dayTotals.fat}g) ===`);
    if (day.notes) {
      lines.push(day.notes);
    }

    for (const meal of day.meals) {
      const mealTotals = computeMealMacros(meal.items);
      const timePart = meal.timeLabel ? ` [${meal.timeLabel}]` : "";
      lines.push("");
      lines.push(
        `• ${meal.title}${timePart} — ${mealTotals.kcal} kcal (P ${mealTotals.protein}g | C ${mealTotals.carbs}g | ${t("G", "F")} ${mealTotals.fat}g)`,
      );
      for (const item of meal.items) {
        const m = computeItemMacros(item);
        const notePart = item.notes ? ` — ${item.notes}` : "";
        lines.push(`  - ${item.name} (${item.grams}g): ${m.kcal} kcal, P ${m.protein}g, C ${m.carbs}g, ${t("G", "F")} ${m.fat}g${notePart}`);
      }
      if (meal.notes) {
        lines.push(`  ${t("Notă", "Note")}: ${meal.notes}`);
      }
    }
  }

  if (plan.notes) {
    lines.push("");
    lines.push(`${t("Recomandări generale", "General guidelines")}:`);
    lines.push(plan.notes);
  }

  return lines.join("\n").trim();
}

// Normalizes nested Supabase query output (snake_case) into MealPlanDocument.
export type RawMealPlanQueryRow = {
  id: string;
  coach_id?: string;
  assigned_client_id?: string | null;
  title: string;
  description: string | null;
  goal: string;
  status: string;
  target_kcal: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
  target_fiber_g: number | null;
  water_liters: number | string | null;
  notes: string | null;
  share_token?: string | null;
  updated_at: string;
  meal_plan_days?: {
    id: string;
    position: number;
    title: string;
    notes: string | null;
    meal_plan_meals?: {
      id: string;
      position: number;
      meal_type: string;
      title: string;
      time_label: string | null;
      notes: string | null;
      meal_plan_items?: {
        id: string;
        position: number;
        food_id?: string | null;
        name: string;
        brand: string | null;
        grams: number | string;
        kcal_per_100g: number | string;
        protein_per_100g: number | string;
        carbs_per_100g: number | string;
        fat_per_100g: number | string;
        fiber_per_100g: number | string | null;
        notes: string | null;
      }[] | null;
    }[] | null;
  }[] | null;
};

export function normalizeMealPlanRow(
  row: RawMealPlanQueryRow,
  meta: { coachName: string; clientName?: string | null },
): MealPlanDocument {
  const safeGoal: MealPlanGoal = (MEAL_PLAN_GOALS as readonly string[]).includes(row.goal)
    ? (row.goal as MealPlanGoal)
    : "maintenance";
  const safeStatus: MealPlanStatus = (MEAL_PLAN_STATUSES as readonly string[]).includes(row.status)
    ? (row.status as MealPlanStatus)
    : "draft";

  const days = [...(row.meal_plan_days ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((d) => ({
      id: d.id,
      position: d.position,
      title: d.title,
      notes: d.notes,
      meals: [...(d.meal_plan_meals ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((m) => ({
          id: m.id,
          position: m.position,
          mealType: (MEAL_PLAN_MEAL_TYPES as readonly string[]).includes(m.meal_type)
            ? (m.meal_type as MealPlanMealType)
            : "Breakfast",
          title: m.title,
          timeLabel: m.time_label,
          notes: m.notes,
          items: [...(m.meal_plan_items ?? [])]
            .sort((a, b) => a.position - b.position)
            .map((item) => ({
              id: item.id,
              position: item.position,
              foodId: item.food_id ?? null,
              name: item.name,
              brand: item.brand,
              grams: Number(item.grams) || 0,
              kcalPer100g: Number(item.kcal_per_100g) || 0,
              proteinPer100g: Number(item.protein_per_100g) || 0,
              carbsPer100g: Number(item.carbs_per_100g) || 0,
              fatPer100g: Number(item.fat_per_100g) || 0,
              fiberPer100g: item.fiber_per_100g === null || item.fiber_per_100g === undefined ? null : Number(item.fiber_per_100g),
              notes: item.notes,
            })),
        })),
    }));

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    goal: safeGoal,
    status: safeStatus,
    targetKcal: row.target_kcal,
    targetProteinG: row.target_protein_g,
    targetCarbsG: row.target_carbs_g,
    targetFatG: row.target_fat_g,
    targetFiberG: row.target_fiber_g,
    waterLiters: row.water_liters === null || row.water_liters === undefined ? null : Number(row.water_liters),
    notes: row.notes,
    coachName: meta.coachName,
    clientName: meta.clientName ?? null,
    assignedClientId: row.assigned_client_id ?? null,
    shareToken: row.share_token ?? null,
    updatedAt: row.updated_at,
    days,
  };
}

// Normalizes the JSONB returned by public.get_shared_meal_plan(token).
export type RawSharedMealPlanJson = {
  id: string;
  title: string;
  description: string | null;
  goal: string;
  status: string;
  target_kcal: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
  target_fiber_g: number | null;
  water_liters: number | string | null;
  notes: string | null;
  coach_name: string;
  updated_at: string;
  days: {
    id: string;
    position: number;
    title: string;
    notes: string | null;
    meals: {
      id: string;
      position: number;
      meal_type: string;
      title: string;
      time_label: string | null;
      notes: string | null;
      items: {
        id: string;
        position: number;
        name: string;
        brand: string | null;
        grams: number | string;
        kcal_per_100g: number | string;
        protein_per_100g: number | string;
        carbs_per_100g: number | string;
        fat_per_100g: number | string;
        fiber_per_100g: number | string | null;
        notes: string | null;
      }[];
    }[];
  }[];
};

export function normalizeSharedMealPlan(raw: RawSharedMealPlanJson): MealPlanDocument {
  return normalizeMealPlanRow(
    {
      ...raw,
      meal_plan_days: (raw.days ?? []).map((d) => ({
        ...d,
        meal_plan_meals: (d.meals ?? []).map((m) => ({
          ...m,
          meal_plan_items: m.items ?? [],
        })),
      })),
    },
    { coachName: raw.coach_name || "Coach", clientName: null },
  );
}
