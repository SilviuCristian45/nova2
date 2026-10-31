import assert from "node:assert/strict";
import { test } from "node:test";
import { nextActiveIndex } from "./combobox.ts";

test("M12: arrows move the active option and wrap, Home/End jump, an empty list has no active option", () => {
  assert.equal(nextActiveIndex("ArrowDown", -1, 3), 0);
  assert.equal(nextActiveIndex("ArrowDown", 2, 3), 0);
  assert.equal(nextActiveIndex("ArrowUp", 0, 3), 2);
  assert.equal(nextActiveIndex("ArrowUp", -1, 3), 2);
  assert.equal(nextActiveIndex("Home", 2, 3), 0);
  assert.equal(nextActiveIndex("End", 0, 3), 2);
  assert.equal(nextActiveIndex("ArrowDown", 0, 0), -1);
  assert.equal(nextActiveIndex("a", 1, 3), 1); // other keys leave it alone
});
