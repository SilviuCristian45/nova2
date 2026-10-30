import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

// workout-label.tsx is a client component: transpile it and stub its language hook.
function loadWorkoutLabel() {
  const file = new URL("../app/components/workout-label.tsx", import.meta.url);
  const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const loaded = { exports: {} };
  vm.runInNewContext(outputText, {
    exports: loaded.exports, module: loaded,
    require: (name) => (name === "./language-provider" ? { useLanguage: () => ({ t: (ro) => ro }) } : require(name)),
  });
  return loaded.exports;
}

const { workoutLabelText } = loadWorkoutLabel();
const ro = (roText) => roText;
const en = (_roText, enText) => enText;

test("workoutLabelText translates known splits and set types", () => {
  assert.equal(workoutLabelText("Push", ro), "Împins");
  assert.equal(workoutLabelText("Push", en), "Push");
  assert.equal(workoutLabelText("Full Body", ro), "Tot corpul");
  assert.equal(workoutLabelText("Working Set", ro), "Set de lucru");
  assert.equal(workoutLabelText("CARDIO", en), "Cardio");
});

test("workoutLabelText returns unknown values unchanged", () => {
  assert.equal(workoutLabelText("Something custom", ro), "Something custom");
  assert.equal(workoutLabelText("", en), "");
});
