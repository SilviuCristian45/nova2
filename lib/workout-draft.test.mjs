import assert from "node:assert/strict";
import { test } from "node:test";
import { restoreDraft } from "./workout-draft.ts";

const typed = { sets: [{ id: "n1" }], cardio: [], mode: "strength" };

test("a late-arriving owner does not overwrite sets typed before the draft loaded", () => {
  // Draft in localStorage is missing/empty: the old effect still did setSessionSets([]).
  assert.deepEqual(restoreDraft(typed, null).sets, [{ id: "n1" }]);
  assert.deepEqual(restoreDraft(typed, JSON.stringify({ sets: [{ id: "old" }], cardio: [], mode: "strength" })).sets, [{ id: "n1" }]);
});

test("an empty current workout takes the saved draft", () => {
  const draft = JSON.stringify({ sets: [{ id: "old" }], cardio: [{ id: "c" }], mode: "cardio" });
  const r = restoreDraft({ sets: [], cardio: [], mode: "strength" }, draft);
  assert.deepEqual(r, { sets: [{ id: "old" }], cardio: [{ id: "c" }], mode: "cardio" });
});

test("a missing draft keeps an empty workout empty", () => {
  assert.deepEqual(restoreDraft({ sets: [], cardio: [], mode: "strength" }, null), { sets: [], cardio: [], mode: "strength" });
});

test("a malformed draft throws", () => {
  assert.throws(() => restoreDraft({ sets: [], cardio: [], mode: "strength" }, JSON.stringify({ sets: 1 })));
});
