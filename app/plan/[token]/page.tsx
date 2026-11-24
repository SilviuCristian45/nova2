import type { Metadata } from "next";
import Link from "next/link";
import { Utensils } from "lucide-react";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { Text } from "@/app/components/language-provider";
import { getLanguage } from "@/app/language";
import {
  isValidShareToken,
  normalizeSharedMealPlan,
  type MealPlanDocument,
  type RawSharedMealPlanJson,
} from "@/lib/coach/meal-plans";
import { MealPlanViewer } from "@/app/components/meal-plan-viewer";
import { Card, CardTitle, Empty, Screen, buttonClass } from "@/app/components/ui";

export const dynamic = "force-dynamic";

async function loadSharedPlan(token: string): Promise<MealPlanDocument | null> {
  if (!isValidShareToken(token)) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const supabase = createAnonClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("get_shared_meal_plan", {
    p_token: token,
  });

  if (error || !data) return null;
  return normalizeSharedMealPlan(data as RawSharedMealPlanJson);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const plan = await loadSharedPlan(token);
  return {
    title: plan ? `${plan.title} · RepLog` : "Plan alimentar · RepLog",
    robots: { index: false, follow: false },
  };
}

export default async function SharedMealPlanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { t } = await getLanguage();
  const plan = await loadSharedPlan(token);

  if (!plan) {
    return (
      <Screen back={false} title={<Text ro="Plan alimentar" en="Meal plan" />}>
        <Empty icon={Utensils}>
          <Text
            ro="Acest link nu este valid sau a fost dezactivat de antrenor."
            en="This link is invalid or has been revoked by the coach."
          />
        </Empty>
        <div className="flex justify-center">
          <Link href="/login" className={buttonClass({ variant: "secondary", small: true })}>
            <Text ro="Deschide RepLog" en="Open RepLog" />
          </Link>
        </div>
      </Screen>
    );
  }

  return (
    <Screen
      back={false}
      title={plan.title}
      right={
        <Link href="/login" className={`${buttonClass({ variant: "secondary", small: true })} no-print`}>
          <Text ro="Deschide aplicația" en="Open app" />
        </Link>
      }
    >
      <MealPlanViewer plan={plan} />

      <Card className="no-print">
        <CardTitle
          description={
            <Text
              ro="Plan alimentar creat în RepLog. Conectează-te în aplicație pentru a-ți urmări mesele, antrenamentele și progresul zilnic."
              en="Meal plan created with RepLog. Sign in to track your daily meals, workouts, and progress."
            />
          }
        >
          {t("Urmărește-ți progresul în RepLog", "Track your progress in RepLog")}
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Link href="/register" className={buttonClass({ small: true })}>
            <Text ro="Creează cont gratuit" en="Create free account" />
          </Link>
          <Link href="/login" className={buttonClass({ variant: "secondary", small: true })}>
            <Text ro="Autentificare" en="Sign in" />
          </Link>
        </div>
      </Card>
    </Screen>
  );
}
