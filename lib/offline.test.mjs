import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { validOfflinePayload, applyMutation, mergeSnapshot } from "./offline/model.ts";

const today = "2026-10-19";
const snapshot = () => ({ ownerId: "alice", downloadedAt: today, workouts: [], steps: [], weights: [] });
const mutation = (id, payload, ownerId = "alice") => ({ id, payload, ownerId, createdAt: today });
const strength = {
  kind: "workout", date: today, mode: "strength", split: "PUSH", cardio: [],
  sets: [{ split: "PUSH", exercise: "Bench Press", setNumber: 1, reps: 8, weight: 60, rir: 2, setType: "normal", notes: "" }],
};

test("offline validation accepts valid metrics and complete workouts only", () => {
  for (const payload of [
    { kind: "steps", date: today, steps: 0 }, { kind: "weight", date: today, weightKg: 72.35 },
    strength, { ...strength, mode: "cardio", sets: [], cardio: [{ activity: "Run", durationMin: 20 }] },
  ]) assert.equal(validOfflinePayload(payload, today), true);
  for (const payload of [
    null, {}, { kind: "steps", date: "2026-02-30", steps: 1 },
    { kind: "steps", date: "2026-10-20", steps: 1 },
    { kind: "steps", date: today, steps: -1 }, { kind: "steps", date: today, steps: 1.5 },
    { kind: "steps", date: today, steps: "100" }, { kind: "weight", date: today, weightKg: 70.123 },
    { kind: "weight", date: today, weightKg: NaN }, { ...strength, sets: [] },
    { ...strength, sets: [{ ...strength.sets[0], reps: 0 }] },
    { ...strength, sets: Array(1001).fill(strength.sets[0]) },
    { ...strength, cardio: [{ activity: "Run", durationMin: 20 }] },
  ]) assert.equal(validOfflinePayload(payload, today), false, JSON.stringify(payload));
});

test("queued metrics override downloads in order without mutating source data", () => {
  const original = snapshot();
  const queue = [
    mutation("1", { kind: "steps", date: today, steps: 100 }),
    mutation("2", { kind: "weight", date: today, weightKg: 70 }),
    mutation("3", { kind: "steps", date: today, steps: 200 }),
  ];
  const merged = mergeSnapshot(original, queue);
  assert.deepEqual(merged.steps, [{ date: today, steps: 200 }]);
  assert.deepEqual(merged.weights, [{ date: today, weight_kg: 70 }]);
  assert.deepEqual(original, snapshot());
  assert.throws(() => applyMutation(original, mutation("x", queue[0].payload, "bob")), /mismatch/);
});

test("replaying an optimistic workout keeps exactly one session and its stable ID", () => {
  const entry = mutation("workout-uuid", strength);
  const merged = mergeSnapshot(snapshot(), [entry, entry]);
  assert.equal(merged.workouts.length, 1);
  assert.equal(merged.workouts[0].id, entry.id);
  assert.equal(merged.workouts[0].pending, true);
  assert.equal(merged.workouts[0].workout_sets[0].weight, 60);
});

function syncHarness() {
  const require = createRequire(import.meta.url);
  const ts = require("typescript");
  let state = { activeOwner: "alice", accounts: { alice: { snapshot: snapshot(), queue: [] } }, revision: 0, enabled: true };
  let fail = false;
  let downloadOwner = "alice";
  let releaseDownload = null;
  const receipts = new Set();
  const requests = [];
  const store = {
    readOfflineDatabase: async () => structuredClone(state),
    activateSnapshot: async (download, revision) => {
      if (!state.enabled || state.revision !== revision) throw new Error("cancelled");
      const queue = state.accounts[download.ownerId]?.queue ?? [];
      state.activeOwner = download.ownerId;
      state.accounts[download.ownerId] = { snapshot: mergeSnapshot(download, queue), queue };
    },
    acknowledgeMutation: async (owner, id) => {
      state.accounts[owner].queue = state.accounts[owner].queue.filter((entry) => entry.id !== id);
    },
    lockOfflineAccount: async () => { state.activeOwner = null; state.enabled = false; state.revision++; },
    enableOfflineDownload: async () => { if (!state.enabled) { state.enabled = true; state.revision++; } },
    enqueueMutation: async (entry) => { state.accounts[entry.ownerId].queue.push(entry); },
    forgetOfflineAccount: async () => { state.accounts = {}; await store.lockOfflineAccount(); },
  };
  const exports = {};
  const sandbox = {
    exports, console, AbortSignal, crypto, CustomEvent,
    navigator: { onLine: true, locks: { request: async (_name, action) => action() } },
    localStorage: { setItem() {} }, window: { dispatchEvent() {} },
    fetch: async (_url, options) => {
      if (options.method === "POST") {
        const entry = JSON.parse(options.body);
        requests.push(entry.id);
        receipts.add(entry.id);
        if (fail) throw new Error("Reply lost after server commit");
        return { ok: true, status: 200, json: async () => ({ success: true, id: entry.id }) };
      }
      if (releaseDownload) await new Promise((resolve) => { releaseDownload(resolve); });
      return { ok: true, status: 200, json: async () => ({ snapshot: { ...snapshot(), ownerId: downloadOwner } }) };
    },
    require: (name) => {
      if (name === "react") return { createContext: () => ({}) };
      if (name === "next/navigation" || name.includes("supabase/client")) return {};
      if (name.includes("daily-metrics")) return { localDate: () => today };
      if (name === "./model") return { validOfflinePayload };
      if (name === "./store") return store;
      throw new Error(`Unexpected dependency ${name}`);
    },
  };
  const source = ts.transpileModule(readFileSync(new URL("./offline/client.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/function OfflineProvider[\s\S]*$/, "");
  // Synchronization is tested without rendering the provider.
  vm.runInNewContext(source + "\nfunction OfflineProvider() {}", sandbox);
  return { api: exports, store, state: () => state, receipts, requests,
    fail: (value) => { fail = value; }, owner: (value) => { downloadOwner = value; },
    hold: (value) => { releaseDownload = value; } };
}

test("sync keeps a lost-reply entry durable, then retries its original ID", async () => {
  const h = syncHarness();
  h.state().accounts.alice.queue.push(mutation("fixed-id", strength));
  h.fail(true);
  await assert.rejects(h.api.syncOffline(), /Reply lost/);
  assert.equal(h.state().accounts.alice.queue[0].id, "fixed-id");
  h.fail(false);
  await h.api.syncOffline();
  assert.deepEqual(h.requests, ["fixed-id", "fixed-id"]);
  assert.equal(h.receipts.size, 1);
  assert.equal(h.state().accounts.alice.queue.length, 0);
});

test("another account never uploads the original owner's pending entries", async () => {
  const h = syncHarness();
  h.state().accounts.alice.queue.push(mutation("alice-entry", strength));
  h.owner("bob");
  await h.api.syncOffline();
  assert.deepEqual(h.requests, []);
  assert.equal(h.state().activeOwner, "bob");
  assert.equal(h.state().accounts.alice.queue.length, 1);
});

test("a stale form cannot queue an entry into a newly active account", async () => {
  const h = syncHarness();
  await assert.rejects(h.api.saveOfflineMutation({ kind: "steps", date: today, steps: 100 }, "bob"), /Account changed/);
  assert.equal(h.state().accounts.alice.queue.length, 0);
});

test("forget or sign-out cancels an in-flight download and pauses automatic sync", async () => {
  const h = syncHarness();
  let resume;
  const started = new Promise((resolve) => h.hold((release) => { resume = release; resolve(); }));
  const running = h.api.syncOffline();
  await started;
  await h.store.forgetOfflineAccount();
  resume();
  await assert.rejects(running, /cancelled/);
  assert.equal(h.state().activeOwner, null);
  h.hold(null);
  await h.api.syncOffline();
  assert.deepEqual(Object.keys(h.state().accounts), []);
  await h.api.syncOffline(true);
  assert.equal(h.state().activeOwner, "alice");
});
