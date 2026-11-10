import test from "node:test";
import assert from "node:assert/strict";
import { CHECKIN_NOTE_MAX, checkinSeries, hasCheckinContent, parseCheckin, parseScore } from "./checkin.ts";
import { applyMutation, validOfflinePayload } from "./offline/model.ts";

const today = "2026-11-10";

test("scores are integers from 1 to 10, blank means not answered", () => {
  assert.equal(parseScore("7"), 7);
  assert.equal(parseScore("10"), 10);
  assert.equal(parseScore(""), null);
  assert.equal(parseScore(null), null);
  for (const bad of ["0", "11", "5.5", "-1", "abc", "1e1"]) assert.equal(parseScore(bad), undefined, bad);
});

test("a check-in needs at least one answer and rejects invalid values", () => {
  assert.deepEqual(parseCheckin({ energy: "6", satiety: "", sleep: "", note: "" }), { energy: 6, satiety: null, sleep: null, note: "" });
  assert.deepEqual(parseCheckin({ note: "  slept badly " }), { energy: null, satiety: null, sleep: null, note: "slept badly" });
  assert.equal(parseCheckin({ energy: "", satiety: "", sleep: "", note: "   " }), null);
  assert.equal(parseCheckin({ energy: "11" }), null);
  assert.equal(parseCheckin({ energy: "5", note: "x".repeat(CHECKIN_NOTE_MAX + 1) }), null);
  assert.equal(parseCheckin({ energy: "5", note: "x".repeat(CHECKIN_NOTE_MAX) })?.energy, 5);
  assert.equal(hasCheckinContent({ energy: null, satiety: null, sleep: null, note: "" }), false);
});

test("the offline payload follows the same limits", () => {
  const checkin = { kind: "checkin", date: today, energy: 7, satiety: null, sleep: 8, note: "" };
  assert.equal(validOfflinePayload(checkin, today), true);
  assert.equal(validOfflinePayload({ ...checkin, energy: null, sleep: null, note: "tired" }, today), true);
  for (const bad of [
    { ...checkin, energy: null, sleep: null }, { ...checkin, energy: 0 }, { ...checkin, sleep: 11 }, { ...checkin, satiety: 5.5 },
    { ...checkin, energy: "7" }, { ...checkin, note: "x".repeat(CHECKIN_NOTE_MAX + 1) }, { ...checkin, note: undefined },
    { ...checkin, date: "2026-11-11" },
  ]) assert.equal(validOfflinePayload(bad, today), false, JSON.stringify(bad));
});

test("a queued check-in replaces the same day in the local snapshot", () => {
  const snapshot = { ownerId: "alice", downloadedAt: today, workouts: [], steps: [], weights: [],
    checkins: [{ date: today, energy: 3, satiety: null, sleep: null, note: "" }] };
  const mutation = (payload) => ({ id: "1", ownerId: "alice", createdAt: today, payload });
  const merged = applyMutation(snapshot, mutation({ kind: "checkin", date: today, energy: 8, satiety: 6, sleep: null, note: "" }));
  assert.deepEqual(merged.checkins, [{ date: today, energy: 8, satiety: 6, sleep: null, note: "" }]);
  const older = { ...snapshot, checkins: undefined };
  assert.equal(applyMutation(older, mutation({ kind: "checkin", date: today, energy: 4, satiety: null, sleep: null, note: "" })).checkins.length, 1);
});

test("the chart series is sorted by date and keeps unanswered scores empty", () => {
  const series = checkinSeries([
    { date: "2026-11-09", energy: 5, satiety: null, sleep: 7, note: "a" },
    { date: "2026-11-08", energy: null, satiety: 6, sleep: null, note: "" },
  ]);
  assert.deepEqual(series, [
    { date: "2026-11-08", energy: null, satiety: 6, sleep: null },
    { date: "2026-11-09", energy: 5, satiety: null, sleep: 7 },
  ]);
});
