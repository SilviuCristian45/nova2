import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { localDate } from "@/lib/daily-metrics";
import { validOfflinePayload } from "@/lib/offline/model";
import { classifyAuthResult, classifySyncRpcError } from "@/lib/offline/errors";
import type { OfflineMutation } from "@/lib/offline/types";

// 401 only when the login really is invalid; if the auth server could not be reached it is a retryable 503,
// otherwise a network blip would look like an expired session on the device.
function authFailure(auth: "invalid" | "unavailable", signIn: string) {
  return auth === "unavailable"
    ? NextResponse.json({ error: "The server could not verify your session right now. Your entries remain on this device; retry." }, { status: 503, headers })
    : NextResponse.json({ error: signIn }, { status: 401, headers });
}

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const PAGE_SIZE = 1000;

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  const auth = classifyAuthResult(user, error);
  if (!user || auth !== "valid") return authFailure(auth === "valid" ? "invalid" : auth, "Sign in again to download or sync offline data.");
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
  // Check-ins are optional: before the migration is applied the table does not exist, which must not break the download.
  async function checkins() {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase.from("daily_checkin").select("date, energy, satiety, sleep, note")
        .eq("user_id", user!.id).gte("date", start).lte("date", end).order("date")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      rows.push(...(data ?? []).map((row) => ({ date: row.date, energy: row.energy, satiety: row.satiety, sleep: row.sleep, note: row.note ?? "" })));
      if (!data || data.length < PAGE_SIZE) return rows;
    }
  }
  try {
    const checkinRows = await checkins().catch((error: unknown) => {
      console.error("Check-in download skipped:", error instanceof Error ? error.message : error);
      return undefined;
    });
    const [workoutRows, stepRows, weightResult] = await Promise.all([
      workouts(), steps(), weights().then((rows) => ({ rows, warning: null as string | null }))
        .catch((error: unknown) => ({
          rows: [], warning: `Weight download failed. Apply the weight migration or retry. ${error instanceof Error ? error.message : ""}`,
        })),
    ]);
    return NextResponse.json({
      snapshot: { ownerId: user.id, downloadedAt: new Date().toISOString(), workouts: workoutRows, steps: stepRows, weights: weightResult.rows, ...(checkinRows ? { checkins: checkinRows } : {}) },
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
  const auth = classifyAuthResult(user, error);
  if (!user || auth !== "valid") return authFailure(auth === "valid" ? "invalid" : auth, "Sign in again to sync. Your entries remain on this device.");
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
    // Validation errors raised by the database are permanent (400, the entry is marked rejected on the device);
    // a missing migration or an outage is a 503 and the entry is simply retried later.
    const failure = classifySyncRpcError(syncError);
    return NextResponse.json({ error: failure.error }, { status: failure.status, headers });
  }
  return NextResponse.json({ success: true, id: mutation.id }, { headers });
}
