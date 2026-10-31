// Runs the real SQL of 202610310004_update_workout_upsert.sql in an in-memory Postgres (PGlite).
// PGlite is not a project dependency; point PGLITE at its entry file to run this, otherwise it is skipped:
//   PGLITE=/path/to/node_modules/@electric-sql/pglite/dist/index.js node --test supabase/tests/*.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const entry = process.env.PGLITE;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const W1 = "11111111-1111-4111-8111-111111111111";
const W2 = "22222222-2222-4222-8222-222222222222";
const WB = "33333333-3333-4333-8333-333333333333";
const S1 = "a0000000-0000-4000-8000-000000000001";
const S2 = "a0000000-0000-4000-8000-000000000002";
const S3 = "a0000000-0000-4000-8000-000000000003";
const OTHER_WORKOUT_SET = "a0000000-0000-4000-8000-000000000004";
const FOREIGN = "b0000000-0000-4000-8000-000000000001";

async function database() {
  const { PGlite } = await import(pathToFileURL(entry).href);
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
    create table public.workouts (id uuid primary key default gen_random_uuid(), user_id uuid not null, performed_on date not null default current_date, split text not null, workout_mode text not null default 'strength');
    create table public.workout_sets (id uuid primary key default gen_random_uuid(), workout_id uuid not null references public.workouts on delete cascade, user_id uuid not null,
      split text not null, exercise text not null, set_number integer not null check (set_number >= 1), reps integer not null check (reps >= 0), rir integer check (rir >= 0 and rir <= 5),
      set_type text not null, created_at timestamptz not null default now(), weight numeric(7,2) not null default 0 check (weight >= 0 and weight <= 10000), notes varchar check (length(notes) < 100));
    create table public.cardio_sessions (id uuid primary key default gen_random_uuid(), workout_id uuid not null references public.workouts on delete cascade, user_id uuid not null, activity text not null, duration_min integer not null);
  `);
  await db.exec(readFileSync(new URL("../migrations/202610310004_update_workout_upsert.sql", import.meta.url), "utf8"));
  await db.query(`insert into public.workouts (id, user_id, split) values ($1,$2,'Push'), ($3,$2,'Pull'), ($4,$5,'Push')`, [W1, A, W2, WB, B]);
  return db;
}

const seed = (db, id, workout, user, exercise, n, notes = null) => db.query(
  `insert into public.workout_sets (id, workout_id, user_id, split, exercise, set_number, reps, rir, set_type, weight, notes) values ($1,$2,$3,'Push',$4,$5,8,2,'Working Set',60,$6)`,
  [id, workout, user, exercise, n, notes]);
const setPayload = (o = {}) => ({ split: "Push", exercise: "Bench", setNumber: 1, reps: 8, weight: 60, rir: 2, setType: "Working Set", notes: "", ...o });

async function update(db, user, workout, sets, cardio = [], mode = "strength") {
  await db.query(`select set_config('app.uid', $1, false)`, [user ?? ""]);
  return db.query(`select public.update_workout($1::uuid, $2, 'Push', '2026-10-30', $3::jsonb, $4::jsonb)`, [workout, mode, JSON.stringify(sets), JSON.stringify(cardio)]);
}
const rows = async (db, workout) => (await db.query(`select id, exercise, set_number, reps, notes from public.workout_sets where workout_id = $1 order by set_number`, [workout])).rows;

const options = { skip: entry ? false : "set PGLITE to run the SQL tests" };

test("existing sets keep their ids and are updated in place; notes survive", options, async () => {
  const db = await database();
  await seed(db, S1, W1, A, "Bench", 1, "heavy"); await seed(db, S2, W1, A, "Bench", 2);
  await update(db, A, W1, [setPayload({ id: S1, reps: 10, notes: "heavy" }), setPayload({ id: S2, setNumber: 2, reps: 9 })]);
  const out = await rows(db, W1);
  assert.deepEqual(out.map((r) => [r.id, r.reps, r.notes]), [[S1, 10, "heavy"], [S2, 9, null]]);
});

test("new sets are inserted with a fresh UUID and removed sets are deleted", options, async () => {
  const db = await database();
  await seed(db, S1, W1, A, "Bench", 1); await seed(db, S2, W1, A, "Bench", 2);
  await update(db, A, W1, [setPayload({ id: S2, setNumber: 1 }), setPayload({ exercise: "Row", setNumber: 2 })]);
  const out = await rows(db, W1);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, S2);
  assert.ok(!out.some((r) => r.id === S1));
  assert.match(out[1].id, /^[0-9a-f-]{36}$/);
  assert.equal(out[1].exercise, "Row");
});

test("a failure rolls the whole edit back (parent, updates, inserts and deletes)", options, async () => {
  const db = await database();
  await seed(db, S1, W1, A, "Bench", 1); await seed(db, S2, W1, A, "Bench", 2);
  await assert.rejects(update(db, A, W1, [setPayload({ id: S1, reps: 99 }), setPayload({ reps: 0 })]), /Invalid workout set/);
  assert.deepEqual((await rows(db, W1)).map((r) => [r.id, r.reps]), [[S1, 8], [S2, 8]]);
  // a late failure (after the first set was already updated and the parent changed) also leaves nothing behind
  await assert.rejects(update(db, A, W1, [setPayload({ id: S1, reps: 99 }), setPayload({ id: FOREIGN })]), /does not belong/);
  assert.deepEqual((await rows(db, W1)).map((r) => [r.id, r.reps]), [[S1, 8], [S2, 8]]);
});

test("ownership: another user's workout, set or a set of another workout cannot be touched", options, async () => {
  const db = await database();
  await seed(db, S1, W1, A, "Bench", 1); await seed(db, OTHER_WORKOUT_SET, W2, A, "Squat", 1); await seed(db, FOREIGN, WB, B, "Bench", 1);
  await assert.rejects(update(db, A, WB, [setPayload()]), /Workout not found/);
  await assert.rejects(update(db, A, W1, [setPayload({ id: FOREIGN })]), /does not belong/);
  await assert.rejects(update(db, A, W1, [setPayload({ id: OTHER_WORKOUT_SET })]), /does not belong/);
  await assert.rejects(update(db, A, W1, [setPayload({ id: S1 }), setPayload({ id: S1, setNumber: 2 })]), /Duplicate set id/);
  await assert.rejects(update(db, A, W1, [setPayload({ id: "not-a-uuid" })]), /Invalid set id/);
  assert.equal((await rows(db, WB)).length, 1);
  assert.equal((await rows(db, W2)).length, 1);
  assert.deepEqual((await rows(db, W1)).map((r) => r.id), [S1]);
  await assert.rejects(update(db, null, W1, [setPayload({ id: S1 })]), /Authentication required/);
});

test("re-importing an older export after an edit does not duplicate the sets that still exist", options, async () => {
  const db = await database();
  await seed(db, S1, W1, A, "Bench", 1); await seed(db, S2, W1, A, "Bench", 2); await seed(db, S3, W1, A, "Bench", 3);
  const exported = JSON.stringify((await db.query(`select * from public.workout_sets where workout_id = $1`, [W1])).rows);
  await update(db, A, W1, [setPayload({ id: S1, reps: 12 }), setPayload({ id: S2, setNumber: 2 })]); // S3 removed, S1 edited
  // Same statement shape as import_my_data: ids are kept and conflicts are skipped.
  await db.query(`insert into public.workout_sets (id, workout_id, user_id, split, exercise, set_number, reps, rir, set_type, created_at, weight, notes)
    select i.id, i.workout_id, $2, i.split, i.exercise, i.set_number, i.reps, i.rir, i.set_type, coalesce(i.created_at, now()), coalesce(i.weight, 0), i.notes
    from jsonb_populate_recordset(null::public.workout_sets, $1::jsonb) i on conflict (id) do nothing`, [exported, A]);
  const out = await rows(db, W1);
  assert.equal(out.filter((r) => r.id === S1).length, 1);
  assert.equal(out.filter((r) => r.id === S2).length, 1);
  assert.equal(out.find((r) => r.id === S1).reps, 12); // the edit was not overwritten by the old export
  assert.equal(out.length, 3); // only the deleted S3 comes back, as an import of a missing row would
});

test("migrations 0001-0004 load, and save_workout / sync_offline_entry accept a set without RIR", options, async () => {
  const db = await database();
  await db.exec(`create table public.offline_sync_receipts (user_id uuid not null, mutation_id uuid not null, payload jsonb not null, primary key (user_id, mutation_id));`);
  for (const file of ["202610310001_update_workout", "202610310002_optional_rir", "202610310003_save_workout", "202610310004_update_workout_upsert"]) {
    await db.exec(readFileSync(new URL(`../migrations/${file}.sql`, import.meta.url), "utf8").replace(/\r/g, ""));
  }
  await db.query(`select set_config('app.uid', $1, false)`, [A]);
  const noRir = setPayload({ rir: null });
  const saved = await db.query(`select public.save_workout('strength', 'Push', '2026-10-30', $1::jsonb, '[]'::jsonb) as id`, [JSON.stringify([noRir, setPayload({ setNumber: 2 })])]);
  const id = saved.rows[0].id;
  assert.deepEqual((await db.query(`select rir from public.workout_sets where workout_id = $1 order by set_number`, [id])).rows.map((r) => r.rir), [null, 2]);
  await assert.rejects(db.query(`select public.save_workout('strength', 'Push', '2026-10-30', $1::jsonb, '[]'::jsonb)`, [JSON.stringify([setPayload({ rir: 6 })])]), /Invalid workout set/);
  assert.equal((await db.query(`select count(*)::int as n from public.workouts where user_id = $1`, [A])).rows[0].n, 3); // the failed save left no empty workout
  const entry = { kind: "workout", date: "2026-10-30", mode: "strength", split: "Push", cardio: [], sets: [{ ...noRir }] };
  await db.query(`select public.sync_offline_entry($1::uuid, $2::jsonb)`, ["44444444-4444-4444-8444-444444444444", JSON.stringify(entry)]);
  assert.equal((await db.query(`select rir from public.workout_sets where workout_id = '44444444-4444-4444-8444-444444444444'`)).rows[0].rir, null);
});

test("normal edits never bring a removed set back; only an explicit import of an old export does", options, async () => {
  const db = await database();
  await seed(db, S1, W1, A, "Bench", 1); await seed(db, S2, W1, A, "Bench", 2); await seed(db, S3, W1, A, "Bench", 3);
  await update(db, A, W1, [setPayload({ id: S1 }), setPayload({ id: S2, setNumber: 2 })]); // S3 removed
  await update(db, A, W1, [setPayload({ id: S1, reps: 11 }), setPayload({ id: S2, setNumber: 2 })]); // edit again
  await update(db, A, W1, [setPayload({ id: S1, reps: 11 }), setPayload({ id: S2, setNumber: 2 }), setPayload({ exercise: "Row", setNumber: 3 })]);
  const ids = (await rows(db, W1)).map((r) => r.id);
  assert.ok(!ids.includes(S3), "S3 stayed removed through further edits");
  assert.equal(ids.length, 3);
  // Sending the removed set's id again is refused: its row no longer exists, so it cannot be silently resurrected.
  await assert.rejects(update(db, A, W1, [setPayload({ id: S3 })]), /does not belong/);
});
