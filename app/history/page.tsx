import { Text } from "@/app/components/language-provider"
import { WorkoutLabel } from "@/app/components/workout-label"
import { getLanguage } from "@/app/language"
import { CardioName, ExerciseName } from "@/app/components/exercise-name"
import { getWeightFormatter } from "@/app/units"
import Link from "next/link";
import { ArrowLeft, Calendar, Dumbbell, Heart, ChevronDown, Flame, Filter, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DeleteWorkoutButton } from "./delete-button";

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
  rir: number;
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
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center p-5 text-center">
        <h1 className="text-2xl font-bold mb-2"><Text ro="Sesiune Expirată" en="Session expired" /></h1>
        <p className="text-muted-foreground mb-6"><Text ro="Trebuie să te loghezi din nou pentru a vedea istoricul." en="Please sign in again to view your history." /></p>
        <Link href="/login" className="px-6 py-2 bg-primary text-primary-foreground rounded-xl font-bold"><Text ro="Mergi la Login" en="Go to sign in" /></Link>
      </main>
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
    return <p role="alert" className="p-5 text-red-700 dark:text-red-400 text-center"><Text ro="Eroare Supabase:" en="Database error:" /> {error.message}</p>;
  }
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);
  const pageHref = (page: number) => `?${new URLSearchParams({ page: String(page), startDate, endDate })}`;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col p-5 sm:p-8 bg-background text-foreground">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label={t("Înapoi", "Back")} className="p-2 -ml-2 text-muted-foreground hover:bg-secondary rounded-xl"><ArrowLeft className="size-5" /></Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight"><Text ro="Istoric" en="History" /></h1>
        </div>
        {streak > 0 && <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 text-orange-700 dark:text-orange-400 rounded-full border border-orange-500/20">
          <Flame className="size-4" /><span className="text-sm font-bold">{streak} <Text ro="săpt." en="wk" /></span>
        </div>}
      </header>

      <form method="GET" className="grid gap-3 mb-6 bg-card p-4 rounded-2xl border border-secondary sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground sm:col-span-3"><Filter className="size-4" /> <Text ro="Filtrează antrenamentele" en="Filter workouts" /></div>
        <div className="flex flex-col gap-1">
          <label htmlFor="history-start" className="text-xs text-muted-foreground"><Text ro="De la" en="From" /></label>
          <input id="history-start" type="date" name="startDate" defaultValue={startDate} className="h-11 min-w-0 px-3 text-sm rounded-xl border bg-background" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="history-end" className="text-xs text-muted-foreground"><Text ro="Până la" en="To" /></label>
          <input id="history-end" type="date" name="endDate" defaultValue={endDate} className="h-11 min-w-0 px-3 text-sm rounded-xl border bg-background" />
        </div>
        <button type="submit" className="h-11 px-5 bg-secondary text-secondary-foreground text-sm font-bold rounded-xl hover:bg-secondary/80"><Text ro="Aplică Filtrele" en="Apply filters" /></button>
      </form>

      {!workouts?.length ? (
        <div className="flex flex-col items-center py-10 text-muted-foreground text-center border border-dashed rounded-xl">
          <Dumbbell className="size-10 mb-3 opacity-30" /><p><Text ro="Nu am găsit antrenamente în această perioadă." en="No workouts found for this period." /></p>
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {workouts.map((workout) => {
            const isCardio = workout.workout_mode === "cardio";
            const date = new Date(`${workout.performed_on}T00:00:00`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
            const groupedSets: Record<string, WorkoutSet[]> = {};
            if (!isCardio) {
              for (const set of workout.workout_sets ?? []) {
                (groupedSets[set.exercise] ??= []).push(set);
              }
            }
            return (
              <article key={workout.id} className="min-w-0 flex flex-col border rounded-2xl bg-card shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-2 p-4 border-b bg-secondary/20">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background border">
                      {isCardio ? <Heart className="size-5 text-rose-600 dark:text-rose-400" /> : <Dumbbell className="size-5" />}
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-bold text-lg break-words">{isCardio ? t("Sesiune Cardio", "Cardio session") : <WorkoutLabel value={workout.split} />}</h2>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Calendar className="size-3 shrink-0" />{date}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link href={`/edit/${workout.id}`} aria-label={t("Editează antrenament", "Edit workout")} className="p-2 text-muted-foreground hover:bg-blue-500/10 hover:text-blue-600 rounded-xl"><Pencil className="size-5" /></Link>
                    <DeleteWorkoutButton id={workout.id} />
                  </div>
                </div>
                <div className="p-4 flex flex-col gap-3">
                  {isCardio ? workout.cardio_sessions?.map((session: { id: string; activity: string; duration_min: number }) => (
                    <div key={session.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border bg-background">
                      <span className="font-semibold"><CardioName id={session.activity} /></span><span className="text-sm text-muted-foreground">{session.duration_min} min</span>
                    </div>
                  )) : Object.entries(groupedSets).map(([exercise, sets]) => (
                    <details key={exercise} className="group border rounded-xl p-3 bg-background">
                      <summary className="flex items-center justify-between gap-3 list-none">
                        <span className="font-semibold text-sm"><ExerciseName id={exercise} /> <span className="text-muted-foreground font-normal">({sets.length} <Text ro="seturi" en="sets" />)</span></span>
                        <ChevronDown className="size-4 shrink-0 text-muted-foreground group-open:rotate-180 transition-transform" />
                      </summary>
                      <div className="mt-3 flex flex-col gap-2 border-t pt-3 text-sm">
                        {sets.map((set) => (
                          <div key={set.id} className="py-1 border-b last:border-0">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-muted-foreground"><Text ro="Set" en="Set" /> {set.set_number} <span className="text-[10px] uppercase bg-secondary px-1.5 py-0.5 rounded-md"><WorkoutLabel value={set.set_type} /></span></span>
                              <span className="font-bold">{set.weight > 0 ? `${format(Number(set.weight))} × ` : ""}{set.reps}<span className="font-normal text-muted-foreground ml-1">(RIR {set.rir})</span></span>
                            </div>
                            {set.notes && <p className="text-xs text-blue-700 dark:text-blue-400 italic mt-1 bg-blue-500/10 px-2 py-1 rounded-md break-words">{set.notes}</p>}
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {totalPages > 1 && (
        <nav aria-label={t("Paginare", "Pagination")} className="mt-8 mb-4 flex flex-wrap gap-2 items-center justify-between border-t pt-4">
          <Link href={pageHref(Math.max(1, currentPage - 1))} aria-disabled={currentPage <= 1} className={`flex items-center gap-1 text-sm p-2 rounded-xl ${currentPage <= 1 ? "pointer-events-none opacity-40" : "hover:bg-secondary"}`}><ChevronLeft className="size-4" /><Text ro="Înapoi" en="Back" /></Link>
          <span className="text-sm text-muted-foreground"><Text ro="Pagina" en="Page" /> {currentPage} <Text ro="din" en="of" /> {totalPages}</span>
          <Link href={pageHref(Math.min(totalPages, currentPage + 1))} aria-disabled={currentPage >= totalPages} className={`flex items-center gap-1 text-sm p-2 rounded-xl ${currentPage >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-secondary"}`}><Text ro="Înainte" en="Next" /><ChevronRight className="size-4" /></Link>
        </nav>
      )}
    </main>
  );
}
