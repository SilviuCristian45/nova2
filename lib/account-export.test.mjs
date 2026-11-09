import assert from "node:assert/strict";
import { test } from "node:test";
import { buildExport } from "./account-export.ts";

// The keys of a "replog-export" v1 file, in order. The import function and the mobile app read exactly these.
const EXPORT_KEYS = [
  "format", "version", "exported_at", "account", "profile", "user_targets", "workout_draft", "workouts",
  "workout_sets", "cardio_sessions", "meals", "meal_items", "foods", "meal_templates", "daily_steps", "daily_weight",
  "google_drive_backup",
];

// Minimal query builder: rows per table, records every filter so the test can check the user scoping.
function fakeClient(tables) {
  const filters = [];
  const read = (row, column) => column.split(".").reduce((value, key) => value?.[key], row);
  return {
    filters,
    from(table) {
      const where = [];
      const rows = () => (tables[table] ?? []).filter((row) => where.every(([column, test]) => test(read(row, column))));
      const query = {
        select: () => query,
        eq: (column, value) => { filters.push([table, column, value]); where.push([column, (cell) => cell === value]); return query; },
        in: (column, values) => { where.push([column, (cell) => values.includes(cell)]); return query; },
        order: () => query,
        range: async (from, to) => ({ data: rows().slice(from, to + 1), error: null }),
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve) => resolve({ data: rows(), error: null }),
      };
      return query;
    },
  };
}

test("buildExport keeps the replog-export v1 structure", async () => {
  const client = fakeClient({
    profiles: [{ id: "u1", display_name: "Ana" }],
    workouts: [{ id: "w1", user_id: "u1" }],
    meal_items: [{ id: "i1", food_id: "catalog-1", meals: { user_id: "u1" } }],
    foods: [{ id: "own-1", user_id: "u1" }, { id: "catalog-1", user_id: null }],
  });
  const body = await buildExport(client, { id: "u1", email: "ana@example.com", created_at: "2026-01-01T00:00:00Z" });

  assert.deepEqual(Object.keys(body), EXPORT_KEYS);
  assert.equal(body.format, "replog-export");
  assert.equal(body.version, 1);
  assert.deepEqual(body.account, { id: "u1", email: "ana@example.com", created_at: "2026-01-01T00:00:00Z" });
  // The join column used only for filtering is dropped from meal items.
  assert.deepEqual(body.meal_items, [{ id: "i1", food_id: "catalog-1" }]);
  // Catalog foods referenced by the user's meals are added after the user's own foods.
  assert.deepEqual(body.foods.map((food) => food.id), ["own-1", "catalog-1"]);
  assert.equal(body.google_drive_backup, null);
});

test("buildExport includes the Drive link without its token", async () => {
  const body = await buildExport(fakeClient({}), { id: "u1" },
    { email: "ana@gmail.com", frequency: "weekly", last_backup_at: "2026-11-01T10:00:00Z", refresh_token: "secret" });
  assert.deepEqual(body.google_drive_backup, { email: "ana@gmail.com", frequency: "weekly", last_backup_at: "2026-11-01T10:00:00Z" });
  assert.ok(!JSON.stringify(body).includes("secret"));
});

test("buildExport filters every table on the given user", async () => {
  const client = fakeClient({});
  await buildExport(client, { id: "u1" });
  const scoped = new Map(client.filters.map(([table, column, value]) => [table, [column, value]]));
  for (const table of ["profiles", "user_targets", "workout_drafts", "workouts", "workout_sets", "cardio_sessions", "meals",
    "meal_items", "foods", "meal_templates", "daily_steps", "daily_weight"]) {
    assert.ok(scoped.has(table), `${table} is not filtered`);
    assert.equal(scoped.get(table)[1], "u1");
  }
  assert.deepEqual(scoped.get("profiles"), ["id", "u1"]);
  assert.deepEqual(scoped.get("meal_items"), ["meals.user_id", "u1"]);
});
