import assert from "node:assert/strict";
import test from "node:test";
import { formatWeight, kgToUnit, progressionStepKg, unitToKg } from "./units.ts";

test("typed lb values survive the kg round trip", () => {
  for (const lb of [0, 2.5, 45, 135, 135.5, 225, 315, 405, 22046]) {
    assert.equal(kgToUnit(unitToKg(lb, "lb"), "lb"), lb, `${lb} lb`);
  }
});

test("kg values are stored and shown with two decimals", () => {
  assert.equal(unitToKg(61.234, "kg"), 61.23);
  assert.equal(kgToUnit(61.23, "kg"), 61.23);
  assert.equal(unitToKg(22046, "lb") <= 10000, true);
});

test("formatting and progression steps follow the unit", () => {
  assert.equal(formatWeight(100, "kg"), "100 kg");
  assert.equal(formatWeight(unitToKg(225, "lb"), "lb"), "225 lb");
  assert.equal(kgToUnit(unitToKg(135, "lb") + progressionStepKg("lb"), "lb"), 140);
  assert.equal(progressionStepKg("kg"), 2.5);
});
