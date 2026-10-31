import assert from "node:assert/strict";
import { test } from "node:test";
import { SyncError, classifyAuthResult, classifyResponse, classifySyncRpcError } from "./offline/errors.ts";
import { rejectedEntryExport } from "./offline/rejected.ts";

test("M9: an auth check that fails because of the network is not an invalid session", () => {
  assert.equal(classifyAuthResult({ id: "u" }, null), "valid");
  assert.equal(classifyAuthResult(null, null), "invalid"); // no session at all
  const named = (name, status) => Object.assign(new Error(name), { name, status });
  assert.equal(classifyAuthResult(null, named("AuthSessionMissingError", 400)), "invalid");
  assert.equal(classifyAuthResult(null, named("AuthApiError", 401)), "invalid"); // expired / revoked token
  assert.equal(classifyAuthResult(null, named("AuthApiError", 403)), "invalid");
  assert.equal(classifyAuthResult(null, named("AuthRetryableFetchError", 0)), "unavailable"); // transport error
  assert.equal(classifyAuthResult(null, named("AuthApiError", 502)), "unavailable");
  assert.equal(classifyAuthResult(null, new TypeError("fetch failed")), "unavailable"); // not an auth error at all
});

test("M9: HTTP answers map to network / session / owner / rejected / server", () => {
  assert.equal(classifyResponse(401), "session");
  assert.equal(classifyResponse(403), "session");
  assert.equal(classifyResponse(409), "owner");
  assert.equal(classifyResponse(400), "rejected");
  assert.equal(classifyResponse(413), "rejected");
  assert.equal(classifyResponse(500), "server");
  assert.equal(classifyResponse(503), "server");
  assert.equal(classifyResponse(502), "server");
  assert.equal(classifyResponse(429), "server");
  assert.equal(classifyResponse(408), "network");
  assert.equal(new SyncError("network", "x").kind, "network");
});

test("M9: database errors: validation is permanent, a missing migration or an outage is retried", () => {
  const rpc = (code, message = "") => classifySyncRpcError({ code, message });
  assert.equal(rpc("P0001", "Invalid workout set").status, 400);
  assert.equal(rpc("P0001", "Mutation ID already used for another entry").status, 400);
  assert.equal(rpc("23514").status, 400);
  assert.equal(rpc("22P02").status, 400);
  assert.equal(rpc("P0001", "Authentication required").status, 401);
  assert.equal(rpc("PGRST202").status, 503);
  assert.equal(rpc("42883").status, 503);
  assert.equal(rpc("57P01").status, 503);
  assert.equal(rpc("08006").status, 503);
  assert.equal(rpc(undefined, "connection reset").status, 503);
});

test("M9: a rejected entry can be exported with its payload, owner and reason", () => {
  const mutation = {
    id: "m1", ownerId: "alice", createdAt: "2026-10-30T10:00:00Z",
    payload: { kind: "workout", date: "2026-10-30", mode: "strength", split: "Push", cardio: [], sets: [] },
    rejected: { reason: "Invalid workout set", at: "2026-10-31T08:00:00Z" },
  };
  const out = rejectedEntryExport(mutation);
  assert.equal(out.filename, "replog-rejected-workout-2026-10-30-m1.json");
  const parsed = JSON.parse(out.json);
  assert.equal(parsed.format, "replog-rejected-entry");
  assert.equal(parsed.entry.id, "m1");
  assert.deepEqual(parsed.entry.payload, mutation.payload);
  assert.equal(parsed.reason, "Invalid workout set");
});
