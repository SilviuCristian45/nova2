import { displayOrdinals } from "@/lib/set-numbering";
import { Text } from "@/app/components/language-provider"
import { WorkoutLabel } from "@/app/components/workout-label"
import { getLanguage } from "@/app/language"
import { CardioName, ExerciseName } from "@/app/components/exercise-name"
import { getWeightFormatter } from "@/app/units"
import Link from "next/link";
import { Dumbbell, ChevronDown, Flame, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DeleteWorkoutButton } from "./delete-button";
import { SetTypeBadge } from "@/app/components/workout-parts";
import { Badge, Card, Empty, Field, Message, Screen, buttonClass, iconButtonClass, inputClass } from "@/app/components/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const PAGE_SIZE = 5;

type WorkoutSet = {
  id: string;
  exercise: string;
  set_number: number;
  set_type: string;
  weight: number;
  reps: number;
  rir: number | null;
  notes: string | null;
};

function calculateWeeklyStreak(workouts: { performed_on: string }[]) {
  const monday = (date: Date) => {
    const copy = new Date(date);
    copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
    return copy.setHours(0, 0, 0, 0);
  };
  const activeWeeks = new Set(workouts.map((workout) => monday(new Date(`${workout.performed_on}T00:00:00`))));
  const date = new Date();
  if (!activeWeeks.has(monday(date))) date.setDate(date.getDate() - 7);
  let streak = 0;
  while (activeWeeks.has(monday(date))) {
    streak++;
    date.setDate(date.getDate() - 7);
  }
  return streak;
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string; page?: string }>;
}) {
  const { t, locale } = await getLanguage()
  const { format } = await getWeightFormatter(locale)

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <Screen back={false} className="min-h-dvh justify-center text-center">
        <h1 className="text-[28px] font-bold tracking-[-0.8px]"><Text ro="Sesiune expirată" en="Session expired" /></h1>
        <p className="text-muted"><Text ro="Trebuie să te loghezi din nou pentru a vedea istoricul." en="Please sign in again to view your history." /></p>
        <Link href="/login" className={buttonClass()}><Text ro="Mergi la login" en="Go to sign in" /></Link>
      </Screen>
    );
  }

  const params = await searchParams;
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);
  const startDate = params.startDate || thirtyDaysAgo.toISOString().split("T")[0];
  const endDate = params.endDate || today.toISOString().split("T")[0];
  const parsedPage = Number(params.page);
  const currentPage = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const { data: allDates } = await supabase.from("workouts").select("performed_on").eq("user_id", user.id);
  const streak = calculateWeeklyStreak(allDates ?? []);
  const { data: workouts, error, count } = await supabase
    .from("workouts").select("*, workout_sets (*), cardio_sessions (*)", { count: "exact" })
    .eq("user_id", user.id).gte("performed_on", startDate).lte("performed_on", endDate)
    .order("performed_on", { ascending: false })
    .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);
  if (error && error.code !== "PGRST103") {
    return <Screen title={<Text ro="Istoric" en="History" />}><Message><Text ro="Eroare Supabase:" en="Database error:" /> {error.message}</Message></Screen>;
  }
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);
  const pageHref = (page: number) => `?${new URLSearchParams({ page: String(page), startDate, endDate })}`;

  return (
    <Screen title={<Text ro="Istoric" en="History" />}
      right={streak > 0 ? <Badge tone="coral" className="gap-1 text-[13px]"><Flame className="size-3.5" />{streak} <Text ro="săpt." en="wk" /></Badge> : undefined}>
      <form method="GET">
        <Card>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label={<Text ro="De la" en="From" />} htmlFor="history-start">
              <input id="history-start" type="date" name="startDate" defaultValue={startDate} className={inputClass()} />
            </Field>
            <Field label={<Text ro="Până la" en="To" />} htmlFor="history-end">
              <input id="history-end" type="date" name="endDate" defaultValue={endDate} className={inputClass()} />
            </Field>
          </div>
          <button type="submit" className={buttonClass({ variant: "secondary" })}><Text ro="Aplică filtrele" en="Apply filters" /></button>
        </Card>
      </form>

      {!workouts?.length ? (
        <Empty icon={Dumbbell}><Text ro="Nu am găsit antrenamente în această perioadă." en="No workouts found for this period." /></Empty>
      ) : (
        workouts.map((workout) => {
          const isCardio = workout.workout_mode === "cardio";
          const date = new Date(`${workout.performed_on}T00:00:00`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
          const groupedSets: Record<string, WorkoutSet[]> = {};
          if (!isCardio) {
            for (const set of workout.workout_sets ?? []) {
              (groupedSets[set.exercise] ??= []).push(set);
            }
          }
          return (
            <Card key={workout.id} padded={false}>
              <div className="flex items-center gap-2 py-3 pl-[18px] pr-2">
                <div className="min-w-0 flex-1">
                  <h2 className="break-words text-[17px] font-semibold">{isCardio ? t("Sesiune cardio", "Cardio session") : <WorkoutLabel value={workout.split} />}</h2>
                  <p className="text-[13px] text-muted">
                    {date}
                    {!isCardio && <> · <span className="tabular-nums">{workout.workout_sets?.length ?? 0}</span> <Text ro="seturi" en="sets" /></>}
                  </p>
                </div>
                <Link href={`/edit/${workout.id}`} aria-label={t("Editează antrenament", "Edit workout")} title={t("Editează antrenament", "Edit workout")} className={iconButtonClass({ plain: true })}><Pencil className="size-5" /></Link>
                <DeleteWorkoutButton id={workout.id} />
              </div>
              {isCardio ? workout.cardio_sessions?.map((session: { id: string; activity: string; duration_min: number }) => (
                <div key={session.id} className="flex items-center justify-between gap-3 border-t border-line px-[18px] py-3.5">
                  <span className="font-medium"><CardioName id={session.activity} /></span>
                  <span className="text-[17px] font-semibold text-coral-text tabular-nums">{session.duration_min} <span className="text-[13px] font-normal text-muted">min</span></span>
                </div>
              )) : Object.entries(groupedSets).map(([exercise, sets]) => (
                <details key={exercise} className="group border-t border-line">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-[18px] py-3 [&::-webkit-details-marker]:hidden">
                    <span className="font-medium"><ExerciseName id={exercise} /> <span className="font-normal text-muted">· {sets.length} <Text ro="seturi" en="sets" /></span></span>
                    <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="mx-[18px] mb-3 flex flex-col rounded-md bg-inner">
                    {sets.map((set, setIndex) => (
                      <div key={set.id} className="flex flex-col gap-1 border-b border-line px-3 py-2.5 last:border-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="w-5 text-sm text-muted tabular-nums">{displayOrdinals(sets.map((x) => ({ exercise: x.exercise, order: x.set_number })))[setIndex]}</span>
                          <span className="font-semibold tabular-nums">{set.weight > 0 ? `${format(Number(set.weight))} × ` : ""}{set.reps}</span>
                          {set.rir !== null && <span className="text-[13px] text-muted">RIR {set.rir}</span>}
                          <SetTypeBadge type={set.set_type} />
                        </div>
                        {set.notes && <p className="break-words pl-7 text-[13px] text-muted">{set.notes}</p>}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </Card>
          );
        })
      )}
      {totalPages > 1 && (
        <nav aria-label={t("Paginare", "Pagination")} className="mt-2 flex items-center justify-between gap-2">
          <Link href={pageHref(Math.max(1, currentPage - 1))} aria-disabled={currentPage <= 1} className={buttonClass({ variant: "secondary", small: true })}><ChevronLeft className="size-4" /><Text ro="Înapoi" en="Back" /></Link>
          <span className="text-sm text-muted tabular-nums"><Text ro="Pagina" en="Page" /> {currentPage} <Text ro="din" en="of" /> {totalPages}</span>
          <Link href={pageHref(Math.min(totalPages, currentPage + 1))} aria-disabled={currentPage >= totalPages} className={buttonClass({ variant: "secondary", small: true })}><Text ro="Înainte" en="Next" /><ChevronRight className="size-4" /></Link>
        </nav>
      )}
    </Screen>
  );
}
