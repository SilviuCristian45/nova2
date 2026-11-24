import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canAccessCoachRoute,
  coachSelfServeEnabled,
  isCoachRoute,
  isValidInviteCode,
  normalizeInviteCode,
  parseSpecialties,
  parseUserRole,
} from "./coach/types.ts";

test("parseUserRole defaults unknown values to client and accepts coach", () => {
  assert.equal(parseUserRole("coach"), "coach");
  assert.equal(parseUserRole("client"), "client");
  assert.equal(parseUserRole("admin"), "client");
  assert.equal(parseUserRole(null), "client");
  assert.equal(parseUserRole(undefined), "client");
});

test("coachSelfServeEnabled defaults to true and respects explicit false flags", () => {
  assert.equal(coachSelfServeEnabled(undefined), true);
  assert.equal(coachSelfServeEnabled(""), true);
  assert.equal(coachSelfServeEnabled("true"), true);
  assert.equal(coachSelfServeEnabled("1"), true);
  assert.equal(coachSelfServeEnabled("false"), false);
  assert.equal(coachSelfServeEnabled("FALSE"), false);
  assert.equal(coachSelfServeEnabled("0"), false);
  assert.equal(coachSelfServeEnabled("off"), false);
  assert.equal(coachSelfServeEnabled("no"), false);
});

test("isCoachRoute matches /coach and nested routes without matching /coaches", () => {
  assert.equal(isCoachRoute("/coach"), true);
  assert.equal(isCoachRoute("/coach/programs"), true);
  assert.equal(isCoachRoute("/coach/clients/123"), true);
  assert.equal(isCoachRoute("/coaches"), false);
  assert.equal(isCoachRoute("/"), false);
  assert.equal(isCoachRoute("/settings"), false);
});

test("canAccessCoachRoute restricts coach area to coach role", () => {
  assert.equal(canAccessCoachRoute("coach"), true);
  assert.equal(canAccessCoachRoute("client"), false);
});

test("invite code helpers normalize and validate 6-16 uppercase alphanumeric codes", () => {
  assert.equal(normalizeInviteCode("  ab-12 cd34  "), "AB12CD34");
  assert.equal(isValidInviteCode(normalizeInviteCode("ab-12cd")), true);
  assert.equal(isValidInviteCode("SHORT"), false);
  assert.equal(isValidInviteCode("TOOLONG1234567890"), false);
  assert.equal(isValidInviteCode("BAD_CODE"), false);
});

test("parseSpecialties trims, deduplicates case-insensitively and caps at 10 items", () => {
  assert.deepEqual(
    parseSpecialties(" Hypertrophy, strength, hypertrophy , , Fat Loss "),
    ["Hypertrophy", "strength", "Fat Loss"],
  );
  const many = Array.from({ length: 15 }, (_, idx) => `Skill ${idx + 1}`).join(", ");
  assert.equal(parseSpecialties(many).length, 10);
});
