import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToString } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime");

function loadModule(relativePath, overrides = {}, globals = {}) {
  const file = new URL(relativePath, import.meta.url);
  const source = readFileSync(file, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const loaded = { exports: {} };
  vm.runInNewContext(outputText, {
    exports: loaded.exports,
    module: loaded,
    require: (name) => Object.hasOwn(overrides, name) ? overrides[name] : require(name),
    ...globals,
  }, { filename: file.pathname });
  return loaded.exports;
}

function renderLanguage(language, globals = {}) {
  let context;
  let refreshCount = 0;
  const { LanguageProvider, LanguageSelector, Text, useLanguage } = loadModule(
    "../app/components/language-provider.tsx", {}, globals,
  );
  function Consumer() {
    context = useLanguage();
    return React.createElement(React.Fragment, null,
      React.createElement(Text, { ro: "Bună", en: "Hello" }),
      React.createElement(LanguageSelector),
    );
  }
  const html = renderToString(React.createElement(
    AppRouterContext.Provider,
    { value: { refresh: () => { refreshCount++; } } },
    React.createElement(LanguageProvider, { initialLanguage: language }, React.createElement(Consumer)),
  ));
  return { html, context, refreshCount: () => refreshCount };
}

test("English and Romanian server renders use the seeded language without a hydration fallback", () => {
  const en = renderLanguage("en");
  assert.equal(en.context.language, "en");
  assert.equal(en.context.locale, "en-US");
  assert.equal(en.context.t("Salvează", "Save"), "Save");
  assert.match(en.html, /^Hello/);
  assert.match(en.html, /aria-label="Interface language"/);
  assert.match(en.html, /value="en" selected=""/);

  const ro = renderLanguage("ro");
  assert.equal(ro.context.language, "ro");
  assert.equal(ro.context.locale, "ro-RO");
  assert.equal(ro.context.t("Salvează", "Save"), "Salvează");
  assert.match(ro.html, /^Bună/);
  assert.match(ro.html, /aria-label="Limba interfeței"/);
  assert.match(ro.html, /value="ro" selected=""/);
});

test("selection persists a site-wide cookie, updates document language and refreshes server content", () => {
  for (const protocol of ["http:", "https:"]) {
    const document = { cookie: "", documentElement: { lang: "en" } };
    const rendered = renderLanguage("en", { document, location: { protocol }, navigator: { onLine: true } });
    rendered.context.setLanguage("ro");
    assert.match(document.cookie, /^language=ro; Path=\/; Max-Age=31536000; SameSite=Lax/);
    assert.equal(document.cookie.includes("; Secure"), protocol === "https:");
    assert.equal(document.documentElement.lang, "ro");
    assert.equal(rendered.refreshCount(), 1);
  }
});

test("cookie reads are async, accept Romanian and default to English for missing or invalid values", async () => {
  for (const [value, expected] of [[undefined, "en"], ["invalid", "en"], ["en", "en"], ["ro", "ro"]]) {
    const { getLanguage } = loadModule("../app/language.ts", {
      "next/headers": { cookies: async () => ({ get: (name) => {
        assert.equal(name, "language");
        return value === undefined ? undefined : { value };
      } }) },
    });
    const result = await getLanguage();
    assert.equal(result.language, expected);
    assert.equal(result.locale, expected === "ro" ? "ro-RO" : "en-US");
    assert.equal(result.t("Bună", "Hello"), expected === "ro" ? "Bună" : "Hello");
  }
});
