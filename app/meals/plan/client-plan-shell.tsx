"use client";

import { useState } from "react";
import { MealPlanViewer } from "@/app/components/meal-plan-viewer";
import type { MealPlanDocument } from "@/lib/coach/meal-plans";
import { applyMealPlanTargetsAction, logPlanMealTodayAction } from "./actions";

export function ClientMealPlanShell({ plans }: { plans: MealPlanDocument[] }) {
  const [selectedId, setSelectedId] = useState(plans[0]?.id ?? "");
  const activePlan = plans.find((p) => p.id === selectedId) ?? plans[0];

  if (!activePlan) return null;

  return (
    <div className="flex flex-col gap-4">
      {plans.length > 1 && (
        <div className="flex flex-wrap gap-2 no-print">
          {plans.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold transition-colors ${
                p.id === activePlan.id ? "bg-lime text-on-solid" : "bg-card text-muted"
              }`}
            >
              {p.title}
            </button>
          ))}
        </div>
      )}

      <MealPlanViewer
        key={activePlan.id}
        plan={activePlan}
        onLogMeal={logPlanMealTodayAction}
        onApplyTargets={applyMealPlanTargetsAction}
      />
    </div>
  );
}
