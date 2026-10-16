import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { parseBodyWeight, isMeasurementDate, localDate } from "./daily-metrics.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = ts.transpileModule(
  readFileSync(new URL("../app/weight/actions.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;

function actions({ user = { id: "owner-id" }, row = null, error = null } = {}) {
  const calls = [];
  const revalidated = [];
  const query = {
    select: (...args) => { calls.push(["select", ...args]); return query; },
    eq: (...args) => { calls.push(["eq", ...args]); return query; },
    maybeSingle: async () => ({ data: row, error }),
    upsert: async (...args) => { calls.push(["upsert", ...args]); return { error }; },
  };
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: (table) => { calls.push(["from", table]); return query; },
  };
  const actionExports = {};
  const mocks = {
    "next/cache": { revalidatePath: (path) => revalidated.push(path) },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/daily-metrics": { parseBodyWeight, isMeasurementDate },
  };
  new Function("require", "exports", source)((id) => {
    assert.ok(id in mocks, `Unexpected import: ${id}`);
    return mocks[id];
  }, actionExports);
  return { ...actionExports, calls, revalidated };
}

function form(weight, date = localDate()) {
  const data = new FormData();
  data.set("date", date);
  data.set("weight", weight);
  return data;
}

test("weight save uses authenticated owner and upserts one row per date, then revalidates", async () => {
  const api = actions();
  const data = form("75,55");
  data.set("user_id", "attacker-supplied-id");
  assert.deepEqual(await api.saveDailyWeight(data), { success: true, weight: 75.55 });
  assert.deepEqual(api.calls, [
    ["from", "daily_weight"],
    ["upsert", { user_id: "owner-id", date: localDate(), weight_kg: 75.55 }, { onConflict: "user_id,date" }],
  ]);
  assert.deepEqual(api.revalidated, ["/", "/stats"]);
});

test("invalid weight/date and unauthenticated requests never write", async () => {
  const api = actions();
  assert.deepEqual(await api.saveDailyWeight(form("0")), { success: false, error: "invalid-weight" });
  assert.deepEqual(await api.saveDailyWeight(form("75", "2026-02-30")), { success: false, error: "invalid-date" });
  assert.equal(api.calls.length, 0);
  const guest = actions({ user: null });
  assert.deepEqual(await guest.saveDailyWeight(form("75")), { success: false, error: "unauthorized" });
  assert.deepEqual(await guest.getDailyWeight(localDate()), { success: false, error: "unauthorized" });
  assert.equal(guest.calls.length, 0);
});

test("weight lookup distinguishes no entry from zero and scopes by owner and date", async () => {
  const api = actions({ row: { weight_kg: "75.55" } });
  assert.deepEqual(await api.getDailyWeight(localDate()), { success: true, weight: 75.55 });
  assert.deepEqual(api.calls, [["from", "daily_weight"], ["select", "weight_kg"], ["eq", "user_id", "owner-id"], ["eq", "date", localDate()]]);
  assert.deepEqual(await actions().getDailyWeight(localDate()), { success: true, weight: null });
});

test("storage failures are explicit and never revalidate as a successful save", async (context) => {
  context.mock.method(console, "error", () => {});
  for (const [code, expected] of [["PGRST205", "setup"], ["42P01", "setup"], ["42501", "storage"]]) {
    const api = actions({ error: { code, message: "Fixture storage failure" } });
    assert.deepEqual(await api.saveDailyWeight(form("75")), { success: false, error: expected });
    assert.deepEqual(await api.getDailyWeight(localDate()), { success: false, error: expected });
    assert.deepEqual(api.revalidated, []);
  }
  assert.equal(console.error.mock.callCount(), 6);
});
