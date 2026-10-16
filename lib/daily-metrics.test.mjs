import assert from "node:assert/strict";
import { test } from "node:test";
import { localDate, isMeasurementDate, parseBodyWeight, chartMode, measurementPoints } from "./daily-metrics.ts";

test("body weight accepts decimal kg, not blanks, zero, malformed or excessive precision", () => {
  for (const [input, expected] of [["75", 75], ["75.5", 75.5], ["75,55", 75.55], [" 0.01 ", 0.01], ["9999.99", 9999.99]]) {
    assert.equal(parseBodyWeight(input), expected);
  }
  for (const input of ["", " ", "0", "-1", "NaN", "Infinity", "10000", "1e2", "7.555", "75abc", null, 75]) {
    assert.equal(parseBodyWeight(input), null);
  }
});

test("measurement dates reject invalid and future dates without UTC shifting local today", () => {
  assert.equal(localDate(new Date(2026, 9, 16, 0, 1)), "2026-10-16");
  assert.equal(isMeasurementDate("2024-02-29", "2026-10-16"), true);
  for (const value of ["2026-02-29", "2026-02-30", "2026-10-17", "", "2026-1-01", "0000-01-01", null]) {
    assert.equal(isMeasurementDate(value, "2026-10-16"), false);
  }
});

test("steps and weight chart links select the correct mode with safe defaults", () => {
  for (const value of ["strength", "cardio", "steps", "weight"]) assert.equal(chartMode(value), value);
  for (const value of ["anything", null, ""]) assert.equal(chartMode(value), "strength");
});

test("measurement graph keeps zero steps and exact weight decimals, with localized labels", () => {
  const data = [{ date: "2026-01-01", value: 0 }, { date: "2026-01-03", value: 75.55 }];
  assert.deepEqual(measurementPoints(data, "en-US").map(({ value }) => value), [0, 75.55]);
  assert.equal(measurementPoints(data, "en-US")[0].label, "Jan 1");
  assert.equal(measurementPoints(data, "ro-RO")[0].label, "1 ian.");
});
