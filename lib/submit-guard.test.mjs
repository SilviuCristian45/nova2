import assert from "node:assert/strict";
import { test } from "node:test";
import { createSubmitGuard, runGuarded } from "./submit-guard.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test("a double click runs the save once", async () => {
  const guard = createSubmitGuard();
  let saves = 0;
  const task = async () => { saves++; await tick(); return true; };
  // All clicks happen in the same tick, before any render could disable the button.
  const results = await Promise.all([runGuarded(guard, task), runGuarded(guard, task), runGuarded(guard, task)]);
  assert.deepEqual(results, ["done", "skipped", "skipped"]);
  assert.equal(saves, 1);
});

test("after a successful save the guard stays locked (the page is about to change)", async () => {
  const guard = createSubmitGuard();
  await runGuarded(guard, async () => true);
  assert.equal(guard.busy, true);
  assert.equal(await runGuarded(guard, async () => assert.fail("second save")), "skipped");
});

test("a failed save releases the guard so the user can retry", async () => {
  const guard = createSubmitGuard();
  assert.equal(await runGuarded(guard, async () => false), "failed");
  assert.equal(guard.busy, false);
  assert.equal(await runGuarded(guard, async () => true), "done");
});

test("a thrown error also releases the guard and is rethrown", async () => {
  const guard = createSubmitGuard();
  await assert.rejects(runGuarded(guard, async () => { throw new Error("network"); }), /network/);
  assert.equal(guard.busy, false);
  assert.equal(await runGuarded(guard, async () => true), "done");
});
