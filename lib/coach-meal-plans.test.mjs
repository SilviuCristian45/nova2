import test from "node:test";
import assert from "node:assert/strict";
import {
  computeDayMacros,
  computeItemMacros,
  computeMealMacros,
  computePlanAverageMacros,
  formatMealPlanAsText,
  generateShareToken,
  isValidShareToken,
  mealTypeLabel,
  normalizeMealPlanRow,
  normalizeSharedMealPlan,
  toDiaryMealType,
  validateMealPlanPayload,
} from "./coach/meal-plans.ts";
import {
  buildPdfFromJpegs,
  mealPlanPdfFilename,
  wrapTextLines,
} from "./coach/meal-plan-pdf.ts";

const tEn = (_ro, en) => en;
const tRo = (ro) => ro;

test("macro computations accurately scale per 100g and round cleanly", () => {
  const chicken = {
    grams: 150,
    kcalPer100g: 165,
    proteinPer100g: 31,
    carbsPer100g: 0,
    fatPer100g: 3.6,
    fiberPer100g: 0,
  };
  const rice = {
    grams: 80,
    kcalPer100g: 350,
    proteinPer100g: 7.5,
    carbsPer100g: 78,
    fatPer100g: 0.6,
    fiberPer100g: 1.5,
  };

  assert.deepEqual(computeItemMacros(chicken), {
    kcal: 248,
    protein: 46.5,
    carbs: 0,
    fat: 5.4,
    fiber: 0,
  });

  assert.deepEqual(computeMealMacros([chicken, rice]), {
    kcal: 528,
    protein: 52.5,
    carbs: 62.4,
    fat: 5.9,
    fiber: 1.2,
  });

  const day1 = { meals: [{ items: [chicken, rice] }] };
  const day2 = { meals: [{ items: [chicken] }] };
  assert.equal(computeDayMacros(day1.meals).kcal, 528);
  assert.equal(computePlanAverageMacros([day1, day2]).kcal, 388);
  assert.deepEqual(computePlanAverageMacros([]), {
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
  });
});

test("validateMealPlanPayload accepts valid payload and trims strings", () => {
  const res = validateMealPlanPayload(
    {
      assignedClientId: null,
      title: "  Plan Slăbire 2000 kcal  ",
      description: "  High protein  ",
      goal: "fat_loss",
      status: "active",
      targetKcal: 2000,
      targetProteinG: 160,
      targetCarbsG: 200,
      targetFatG: 60,
      targetFiberG: 30,
      waterLiters: 2.55,
      notes: "  Cântărit crud  ",
      days: [
        {
          title: "  Zilnic  ",
          notes: "",
          meals: [
            {
              mealType: "Breakfast",
              title: "  Mic dejun  ",
              timeLabel: " 08:00 ",
              notes: "",
              items: [
                {
                  foodId: null,
                  name: "  Ovăz  ",
                  brand: "  Bio  ",
                  grams: 75.44,
                  kcalPer100g: 370,
                  proteinPer100g: 13.5,
                  carbsPer100g: 60,
                  fatPer100g: 7,
                  fiberPer100g: 10,
                  notes: "  cu apă  ",
                },
              ],
            },
          ],
        },
      ],
    },
    tEn,
  );

  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.data.title, "Plan Slăbire 2000 kcal");
  assert.equal(res.data.waterLiters, 2.6);
  assert.equal(res.data.days[0].meals[0].items[0].grams, 75.4);
  assert.equal(res.data.days[0].meals[0].items[0].name, "Ovăz");
});

test("validateMealPlanPayload rejects invalid bounds matching Postgres constraints", () => {
  const base = {
    assignedClientId: null,
    title: "Valid Plan",
    description: "",
    goal: "maintenance",
    status: "draft",
    targetKcal: 2200,
    targetProteinG: 150,
    targetCarbsG: 250,
    targetFatG: 70,
    targetFiberG: 30,
    waterLiters: 2.5,
    notes: "",
    days: [
      {
        title: "Daily",
        notes: "",
        meals: [
          {
            mealType: "Breakfast",
            title: "Breakfast",
            timeLabel: "08:00",
            notes: "",
            items: [],
          },
        ],
      },
    ],
  };

  assert.equal(validateMealPlanPayload({ ...base, title: "   " }, tEn).ok, false);
  assert.equal(validateMealPlanPayload({ ...base, targetKcal: 200 }, tEn).ok, false);
  assert.equal(validateMealPlanPayload({ ...base, waterLiters: 25 }, tEn).ok, false);
  assert.equal(validateMealPlanPayload({ ...base, days: [] }, tEn).ok, false);
  assert.equal(
    validateMealPlanPayload(
      {
        ...base,
        days: [
          {
            ...base.days[0],
            meals: [
              {
                ...base.days[0].meals[0],
                items: [
                  {
                    foodId: null,
                    name: "Oats",
                    brand: "",
                    grams: 0,
                    kcalPer100g: 370,
                    proteinPer100g: 13,
                    carbsPer100g: 60,
                    fatPer100g: 7,
                    fiberPer100g: null,
                    notes: "",
                  },
                ],
              },
            ],
          },
        ],
      },
      tEn,
    ).ok,
    false,
  );
});

test("share token generation and validation enforce URL-safe 16-64 char format", () => {
  const token = generateShareToken(24);
  assert.equal(token.length, 24);
  assert.equal(isValidShareToken(token), true);
  assert.equal(isValidShareToken("short"), false);
  assert.equal(isValidShareToken("bad token with spaces!!!!"), false);
});

test("normalizeMealPlanRow and normalizeSharedMealPlan sort positions and format text cleanly", () => {
  const doc = normalizeSharedMealPlan({
    id: "plan-1",
    title: "Plan Recompoziție",
    description: "Structură flexibilă",
    goal: "recomp",
    status: "active",
    target_kcal: 2100,
    target_protein_g: 165,
    target_carbs_g: 210,
    target_fat_g: 65,
    target_fiber_g: 30,
    water_liters: "3.0",
    notes: "Creatină 5g/zi",
    coach_name: "Coach Ana",
    updated_at: "2026-11-24T12:00:00.000Z",
    days: [
      {
        id: "d2",
        position: 2,
        title: "Zi pauză",
        notes: null,
        meals: [],
      },
      {
        id: "d1",
        position: 1,
        title: "Zi antrenament",
        notes: "Carbo mai mulți",
        meals: [
          {
            id: "m1",
            position: 1,
            meal_type: "Breakfast",
            title: "Mic dejun",
            time_label: "08:00",
            notes: "Fiert sau omletă",
            items: [
              {
                id: "i1",
                position: 1,
                name: "Ouă",
                brand: null,
                grams: "180",
                kcal_per_100g: "143",
                protein_per_100g: "12.6",
                carbs_per_100g: "0.7",
                fat_per_100g: "9.5",
                fiber_per_100g: null,
                notes: "3 ouă M",
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(doc.days[0].id, "d1");
  assert.equal(doc.days[1].id, "d2");
  assert.equal(doc.waterLiters, 3);
  assert.equal(doc.coachName, "Coach Ana");

  const textRo = formatMealPlanAsText(doc, tRo);
  assert.match(textRo, /PLAN RECOMPOZIȚIE/);
  assert.match(textRo, /Coach Ana/);
  assert.match(textRo, /2100 kcal/);
  assert.match(textRo, /Ouă \(180g\)/);
  assert.match(textRo, /Creatină 5g\/zi/);

  const rowDoc = normalizeMealPlanRow(
    {
      id: "plan-2",
      title: "Test",
      description: null,
      goal: "unknown_goal",
      status: "unknown_status",
      target_kcal: null,
      target_protein_g: null,
      target_carbs_g: null,
      target_fat_g: null,
      target_fiber_g: null,
      water_liters: null,
      notes: null,
      updated_at: "2026-11-24T12:00:00.000Z",
      meal_plan_days: [],
    },
    { coachName: "Coach", clientName: "Ion" },
  );
  assert.equal(rowDoc.goal, "maintenance");
  assert.equal(rowDoc.status, "draft");
  assert.equal(rowDoc.clientName, "Ion");
});

test("buildPdfFromJpegs produces valid multi-page PDF 1.4 with accurate xref offsets", () => {
  const fakeJpeg1 = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
  const fakeJpeg2 = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03, 0xff, 0xd9]);

  const pdf = buildPdfFromJpegs([
    { jpegBytes: fakeJpeg1, widthPx: 1240, heightPx: 1754 },
    { jpegBytes: fakeJpeg2, widthPx: 1240, heightPx: 1754 },
  ]);

  const ascii = new TextDecoder("latin1").decode(pdf);
  assert.ok(ascii.startsWith("%PDF-1.4\n"));
  assert.ok(ascii.includes("/Count 2"));
  assert.ok(ascii.includes("/Filter /DCTDecode"));
  assert.ok(ascii.includes("/MediaBox [ 0 0 595.28 841.89 ]"));
  assert.ok(ascii.trimEnd().endsWith("%%EOF"));

  // Verify xref table points to the exact start of each object.
  const xrefIdx = ascii.indexOf("xref\n");
  assert.ok(xrefIdx > 0);
  const startxrefMatch = ascii.match(/startxref\n(\d+)\n%%EOF/);
  assert.ok(startxrefMatch);
  assert.equal(Number(startxrefMatch[1]), xrefIdx);

  const obj1Offset = ascii.indexOf("1 0 obj\n");
  assert.ok(ascii.includes(`${String(obj1Offset).padStart(10, "0")} 00000 n `));

  assert.throws(() => buildPdfFromJpegs([]));
});

test("wrapTextLines and mealPlanPdfFilename handle Romanian diacritics", () => {
  const lines = wrapTextLines("Piept de pui la grătar cu orez basmati", 160, (s) => s.length * 10);
  assert.ok(lines.length >= 2);
  assert.ok(lines.every((l) => l.length * 10 <= 160));

  assert.equal(mealPlanPdfFilename("Plan Slăbire — Ștefan (2100 kcal)"), "replog-plan-slabire-stefan-2100-kcal.pdf");
  assert.equal(mealPlanPdfFilename("!!!"), "replog-meal-plan.pdf");
});

test("numbered meals ('Meal') validate, label with position, and map safely to diary meal types", () => {
  assert.equal(mealTypeLabel("Meal", tRo, 1), "Masa 1");
  assert.equal(mealTypeLabel("Meal", tEn, 5), "Meal 5");
  assert.equal(mealTypeLabel("Meal", tRo), "Masă numerotată");

  assert.equal(toDiaryMealType("Breakfast", 4), "Breakfast");
  assert.equal(toDiaryMealType("Meal", 1), "Breakfast");
  assert.equal(toDiaryMealType("Meal", 2), "Lunch");
  assert.equal(toDiaryMealType("Meal", 3), "Dinner");
  assert.equal(toDiaryMealType("Meal", 4), "Snack");
  assert.equal(toDiaryMealType("Meal", 6), "Snack");

  const valid = validateMealPlanPayload(
    {
      assignedClientId: null,
      title: "6-Meal Bodybuilding Plan",
      description: "",
      goal: "muscle_gain",
      status: "active",
      targetKcal: 3400,
      targetProteinG: 220,
      targetCarbsG: 450,
      targetFatG: 80,
      targetFiberG: 40,
      waterLiters: 4,
      notes: "",
      days: [
        {
          title: "Training Day",
          notes: "",
          meals: [1, 2, 3, 4, 5, 6].map((n) => ({
            mealType: "Meal",
            title: `Meal ${n}`,
            timeLabel: "",
            notes: "",
            items: [],
          })),
        },
      ],
    },
    tEn,
  );
  assert.equal(valid.ok, true);
});
