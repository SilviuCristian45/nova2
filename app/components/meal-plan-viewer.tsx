"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check,
  Clock,
  Droplets,
  PlusCircle,
  Target,
  Utensils,
} from "lucide-react";
import { Text, useLanguage } from "@/app/components/language-provider";
import { FoodLabel } from "@/app/components/food-label";
import { MealPlanExportBar } from "@/app/components/meal-plan-export-bar";
import { Badge, Button, Card, CardTitle, Message, buttonClass } from "@/app/components/ui";
import {
  computeDayMacros,
  computeItemMacros,
  computeMealMacros,
  mealPlanGoalLabel,
  mealTypeLabel,
  type MealPlanDocument,
} from "@/lib/coach/meal-plans";

export function MealPlanViewer({
  plan,
  onLogMeal,
  onApplyTargets,
}: {
  plan: MealPlanDocument;
  onLogMeal?: (mealId: string) => Promise<{ success?: boolean; error?: string }>;
  onApplyTargets?: (planId: string) => Promise<{ success?: boolean; error?: string }>;
}) {
  const { t, locale } = useLanguage();
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [loggingMealId, setLoggingMealId] = useState<string | null>(null);
  const [loggedMeals, setLoggedMeals] = useState<Record<string, boolean>>({});
  const [applyingTargets, setApplyingTargets] = useState(false);
  const [targetsApplied, setTargetsApplied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const safeIdx = Math.min(selectedDayIdx, Math.max(0, plan.days.length - 1));
  const activeDay = plan.days[safeIdx];
  const dayMacros = activeDay
    ? computeDayMacros(activeDay.meals)
    : { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

  const hasTargets =
    plan.targetKcal !== null ||
    plan.targetProteinG !== null ||
    plan.targetCarbsG !== null ||
    plan.targetFatG !== null ||
    plan.targetFiberG !== null ||
    plan.waterLiters !== null;

  const hasMacroTargetsToApply =
    plan.targetKcal !== null ||
    plan.targetProteinG !== null ||
    plan.targetCarbsG !== null ||
    plan.targetFatG !== null;

  const updatedLabel = new Date(plan.updatedAt).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  async function handleLogMeal(mealId: string) {
    if (!onLogMeal) return;
    setLoggingMealId(mealId);
    setActionError(null);
    try {
      const res = await onLogMeal(mealId);
      if (res.error) {
        setActionError(res.error);
        return;
      }
      setLoggedMeals((prev) => ({ ...prev, [mealId]: true }));
    } finally {
      setLoggingMealId(null);
    }
  }

  async function handleApplyTargets() {
    if (!onApplyTargets) return;
    setApplyingTargets(true);
    setActionError(null);
    try {
      const res = await onApplyTargets(plan.id);
      if (res.error) {
        setActionError(res.error);
        return;
      }
      setTargetsApplied(true);
    } finally {
      setApplyingTargets(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {/* Header summary card */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="lime">{mealPlanGoalLabel(plan.goal, t)}</Badge>
              <Badge>
                {t("Antrenor", "Coach")}: {plan.coachName}
              </Badge>
            </div>
            <h2 className="text-[24px] font-bold tracking-[-0.5px]">{plan.title}</h2>
            <p className="text-xs text-muted">
              {t("Actualizat", "Updated")}: {updatedLabel}
            </p>
          </div>
        </div>

        {plan.description && (
          <p className="whitespace-pre-line text-sm text-soft">{plan.description}</p>
        )}

        {hasTargets && (
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {plan.targetKcal !== null && (
                <div className="rounded-md bg-lime-soft px-3 py-2.5">
                  <span className="block text-[11px] font-semibold uppercase text-lime-text">
                    <Text ro="Calorii" en="Calories" />
                  </span>
                  <span className="text-lg font-bold tabular-nums text-foreground">
                    {plan.targetKcal} kcal
                  </span>
                </div>
              )}
              {plan.targetProteinG !== null && (
                <div className="rounded-md bg-ice-soft px-3 py-2.5">
                  <span className="block text-[11px] font-semibold uppercase text-ice-text">
                    <Text ro="Proteine" en="Protein" />
                  </span>
                  <span className="text-lg font-bold tabular-nums text-foreground">
                    {plan.targetProteinG} g
                  </span>
                </div>
              )}
              {plan.targetCarbsG !== null && (
                <div className="rounded-md bg-gold-soft px-3 py-2.5">
                  <span className="block text-[11px] font-semibold uppercase text-gold-text">
                    <Text ro="Carbohidrați" en="Carbs" />
                  </span>
                  <span className="text-lg font-bold tabular-nums text-foreground">
                    {plan.targetCarbsG} g
                  </span>
                </div>
              )}
              {plan.targetFatG !== null && (
                <div className="rounded-md bg-coral-soft px-3 py-2.5">
                  <span className="block text-[11px] font-semibold uppercase text-coral-text">
                    <Text ro="Grăsimi" en="Fat" />
                  </span>
                  <span className="text-lg font-bold tabular-nums text-foreground">
                    {plan.targetFatG} g
                  </span>
                </div>
              )}
              {plan.targetFiberG !== null && (
                <div className="rounded-md bg-inner px-3 py-2.5">
                  <span className="block text-[11px] font-semibold uppercase text-muted">
                    <Text ro="Fibre" en="Fiber" />
                  </span>
                  <span className="text-lg font-bold tabular-nums text-foreground">
                    {plan.targetFiberG} g
                  </span>
                </div>
              )}
              {plan.waterLiters !== null && (
                <div className="rounded-md bg-ice-soft px-3 py-2.5">
                  <span className="flex items-center gap-1 text-[11px] font-semibold uppercase text-ice-text">
                    <Droplets className="size-3" />
                    <Text ro="Apă" en="Water" />
                  </span>
                  <span className="text-lg font-bold tabular-nums text-foreground">
                    {plan.waterLiters} L
                  </span>
                </div>
              )}
            </div>

            {onApplyTargets && hasMacroTargetsToApply && (
              <div className="flex flex-wrap items-center gap-2 no-print">
                <Button
                  variant={targetsApplied ? "soft" : "secondary"}
                  tone={targetsApplied ? "lime" : undefined}
                  small
                  icon={targetsApplied ? Check : Target}
                  busy={applyingTargets}
                  onClick={() => void handleApplyTargets()}
                >
                  {targetsApplied ? (
                    <Text ro="Obiective zilnice aplicate" en="Daily goals applied" />
                  ) : (
                    <Text ro="Aplică drept obiectivele mele zilnice" en="Apply as my daily goals" />
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Export & Share Bar */}
      <MealPlanExportBar plan={plan} compact />

      {actionError && <Message>{actionError}</Message>}

      {/* Day switcher (when multiple days exist) */}
      {plan.days.length > 1 && (
        <div className="flex flex-wrap gap-2 no-print">
          {plan.days.map((d, idx) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelectedDayIdx(idx)}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold transition-colors ${
                idx === safeIdx ? "bg-lime text-on-solid" : "bg-card text-muted"
              }`}
            >
              {d.title}
            </button>
          ))}
        </div>
      )}

      {/* Active day summary & meals */}
      {activeDay && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card px-4 py-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold">{activeDay.title}</h3>
              {activeDay.notes && <p className="text-xs text-soft">{activeDay.notes}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums">
              <Badge tone="lime">{dayMacros.kcal} kcal</Badge>
              <Badge tone="ice">P {dayMacros.protein}g</Badge>
              <Badge tone="gold">C {dayMacros.carbs}g</Badge>
              <Badge tone="coral">{t("G", "F")} {dayMacros.fat}g</Badge>
            </div>
          </div>

          {activeDay.meals.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">
                <Text ro="Nicio masă configurată pentru această zi." en="No meals configured for this day." />
              </p>
            </Card>
          ) : (
            activeDay.meals.map((meal) => {
              const mealMacros = computeMealMacros(meal.items);
              const isLogged = Boolean(loggedMeals[meal.id]);

              return (
                <Card key={meal.id} className="print-break-inside-avoid">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="lime">{mealTypeLabel(meal.mealType, t, meal.position)}</Badge>
                        {meal.timeLabel && (
                          <Badge className="gap-1">
                            <Clock className="size-3" />
                            {meal.timeLabel}
                          </Badge>
                        )}
                      </div>
                      <h4 className="text-[19px] font-semibold tracking-[-0.3px]">
                        {meal.title}
                      </h4>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums">
                      <Badge tone="lime">{mealMacros.kcal} kcal</Badge>
                      <Badge tone="ice">P {mealMacros.protein}g</Badge>
                      <Badge tone="gold">C {mealMacros.carbs}g</Badge>
                      <Badge tone="coral">{t("G", "F")} {mealMacros.fat}g</Badge>
                    </div>
                  </div>

                  {meal.items.length > 0 && (
                    <div className="flex flex-col overflow-hidden rounded-md bg-inner">
                      {meal.items.map((item, idx) => {
                        const m = computeItemMacros(item);
                        return (
                          <div
                            key={item.id}
                            className={`flex flex-wrap items-start justify-between gap-2 px-3.5 py-2.5 ${
                              idx > 0 ? "border-t border-line" : ""
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium leading-snug text-foreground">
                                <FoodLabel value={item.name} />
                                {item.brand && (
                                  <span className="ml-1.5 text-xs font-normal text-muted">
                                    ({item.brand})
                                  </span>
                                )}
                              </p>
                              {item.notes && (
                                <p className="text-xs text-soft">{item.notes}</p>
                              )}
                            </div>
                            <div className="flex flex-col items-end text-right tabular-nums">
                              <span className="text-sm font-semibold text-foreground">
                                {item.grams} g · {m.kcal} kcal
                              </span>
                              <span className="flex gap-2 text-xs">
                                <span className="text-ice-text">P {m.protein}g</span>
                                <span className="text-gold-text">C {m.carbs}g</span>
                                <span className="text-coral-text">{t("G", "F")} {m.fat}g</span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {meal.notes && (
                    <p className="rounded-md bg-inner px-3.5 py-2.5 text-xs text-soft">
                      <span className="font-semibold text-foreground">
                        <Text ro="Notă: " en="Note: " />
                      </span>
                      {meal.notes}
                    </p>
                  )}

                  {onLogMeal && meal.items.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 no-print">
                      <Button
                        variant={isLogged ? "soft" : "secondary"}
                        tone={isLogged ? "lime" : undefined}
                        small
                        icon={isLogged ? Check : PlusCircle}
                        busy={loggingMealId === meal.id}
                        disabled={loggingMealId !== null}
                        onClick={() => void handleLogMeal(meal.id)}
                      >
                        {isLogged ? (
                          <Text ro="Masă înregistrată azi" en="Meal logged today" />
                        ) : (
                          <Text ro="Loghează această masă azi" en="Log this meal today" />
                        )}
                      </Button>
                      {isLogged && (
                        <Link
                          href="/meals/history"
                          className={buttonClass({ variant: "outline", small: true })}
                        >
                          <Utensils className="size-4" />
                          <Text ro="Vezi jurnalul" en="View diary" />
                        </Link>
                      )}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* General Coach Guidelines */}
      {plan.notes && (
        <Card className="print-break-inside-avoid">
          <CardTitle>
            <Text ro="Recomandări generale" en="General guidelines" />
          </CardTitle>
          <p className="whitespace-pre-line text-sm text-soft">{plan.notes}</p>
        </Card>
      )}
    </div>
  );
}
