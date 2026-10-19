import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { localDate } from "@/lib/daily-metrics";
import { validOfflinePayload } from "@/lib/offline/model";
import type { OfflineMutation } from "@/lib/offline/types";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const PAGE_SIZE = 1000;

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Sign in again to download or sync offline data." }, { status: 401, headers });
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const start = localDate(cutoff);
  // Include dates in the user's local timezone, including the UTC date boundary.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const end = localDate(tomorrow);
  async function workouts() {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase.from("workouts")
        .select("id, performed_on, workout_mode, split, workout_sets(id, exercise, weight, reps, rir, set_type, set_number, notes), cardio_sessions(id, activity, duration_min)")
        .eq("user_id", user!.id).gte("performed_on", start).lte("performed_on", end)
        .order("performed_on", { ascending: false }).order("id")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      rows.push(...(data ?? []).map((row) => ({ ...row, performed_on: row.performed_on.slice(0, 10) })));
      if (!data || data.length < PAGE_SIZE) return rows;
    }
  }
  async function steps() {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase.from("daily_steps").select("date, steps")
        .eq("user_id", user!.id).gte("date", start).lte("date", end).order("date")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) return rows;
    }
  }
  async function weights() {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase.from("daily_weight").select("date, weight_kg")
        .eq("user_id", user!.id).gte("date", start).lte("date", end).order("date")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      rows.push(...(data ?? []).map((row) => ({ date: row.date, weight_kg: Number(row.weight_kg) })));
      if (!data || data.length < PAGE_SIZE) return rows;
    }
  }
  try {
    const [workoutRows, stepRows, weightResult] = await Promise.all([
      workouts(), steps(), weights().then((rows) => ({ rows, warning: null as string | null }))
        .catch((error: unknown) => ({
          rows: [], warning: `Weight download failed. Apply the weight migration or retry. ${error instanceof Error ? error.message : ""}`,
        })),
    ]);
    return NextResponse.json({
      snapshot: { ownerId: user.id, downloadedAt: new Date().toISOString(), workouts: workoutRows, steps: stepRows, weights: weightResult.rows },
      warning: weightResult.warning,
    }, { headers });
  } catch (error) {
    console.error("Offline download failed:", error);
    return NextResponse.json({ error: "Offline history download failed. Please retry while online." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 2_000_000) {
    return NextResponse.json({ error: "Offline entry is too large." }, { status: 413, headers });
  }
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Sign in again to sync. Your entries remain on this device." }, { status: 401, headers });
  let mutation: OfflineMutation;
  try {
    const text = await request.text();
    if (text.length > 2_000_000) throw new Error("Too large");
    mutation = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid offline entry." }, { status: 400, headers });
  }
  if (!mutation || mutation.ownerId !== user.id) {
    return NextResponse.json({ error: "This entry belongs to another account. Sign in to its original account." }, { status: 409, headers });
  }
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (typeof mutation.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mutation.id) ||
    !validOfflinePayload(mutation.payload, localDate(tomorrow))) {
    return NextResponse.json({ error: "Invalid offline values. Entries have not been discarded." }, { status: 400, headers });
  }
  const { error: syncError } = await supabase.rpc("sync_offline_entry", {
    mutation_id: mutation.id, entry: mutation.payload,
  });
  if (syncError) {
    console.error("Offline sync failed:", syncError.code, syncError.message);
    return NextResponse.json({
      error: syncError.code === "PGRST202" || syncError.code === "42883"
        ? "Offline sync needs the database migration. Your entries remain safely queued on this device."
        : "Offline sync failed. Your entries remain on this device; retry or sign in again.",
    }, { status: 503, headers });
  }
  return NextResponse.json({ success: true, id: mutation.id }, { headers });
}
