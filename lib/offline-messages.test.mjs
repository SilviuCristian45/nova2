import assert from "node:assert/strict";
import { test } from "node:test";
import { localizeOfflineMessage } from "./offline/messages.ts";
import { randomId } from "./random-id.ts";

const ro = (r) => r;
const en = (_r, e) => e;

test("L7: known offline errors are translated, unknown ones pass through", () => {
  assert.equal(localizeOfflineMessage("Download your data before offline logging.", ro), "Descarcă-ți datele înainte de a înregistra offline.");
  assert.equal(localizeOfflineMessage("Download your data before offline logging.", en), "Download your data before offline logging.");
  assert.match(localizeOfflineMessage("Sync failed (503).", ro), /503/);
  assert.equal(localizeOfflineMessage("Something else", ro), "Something else");
});

test("L7b: ids still work where crypto.randomUUID is missing (http://IP is not a secure context)", () => {
  const insecure = { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = (i * 37 + 11) & 255; return a; } };
  assert.match(randomId(insecure), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(randomId({ randomUUID: () => "fixed", getRandomValues: insecure.getRandomValues }), "fixed");
  assert.throws(() => randomId({}), /random/i);
});
