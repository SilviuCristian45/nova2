import assert from "node:assert/strict";
import { test } from "node:test";
import { canShareFile, isIOSLike, shareImageFile } from "./share-image.ts";

const file = new File([new Uint8Array([1, 2, 3])], "card.png", { type: "image/png" });
const sharing = (share) => ({ canShare: () => true, share });

test("browsers without the Web Share API fall back to saving", async () => {
  assert.equal(canShareFile(undefined, file), false);
  assert.equal(canShareFile({}, file), false);
  assert.equal(canShareFile({ share: async () => {} }, file), false); // no canShare: file support is unknown
  assert.equal(await shareImageFile({}, file, "RepLog"), "unsupported");
  assert.equal(await shareImageFile(undefined, file, "RepLog"), "unsupported");
});

test("browsers that cannot share files are treated as unsupported", async () => {
  const nav = { canShare: () => false, share: async () => assert.fail("must not be called") };
  assert.equal(canShareFile(nav, file), false);
  assert.equal(await shareImageFile(nav, file, "RepLog"), "unsupported");
  assert.equal(canShareFile({ canShare: () => { throw new TypeError("bad"); }, share: async () => {} }, file), false);
});

test("a successful share passes the file and title", async () => {
  let received;
  const result = await shareImageFile(sharing(async (data) => { received = data; }), file, "RepLog");
  assert.equal(result, "shared");
  assert.deepEqual(received.files, [file]);
  assert.equal(received.title, "RepLog");
});

test("dismissing the share sheet is not an error, other failures are", async () => {
  const abort = Object.assign(new Error("closed"), { name: "AbortError" });
  assert.equal(await shareImageFile(sharing(async () => { throw abort; }), file, "RepLog"), "cancelled");
  assert.equal(await shareImageFile(sharing(async () => { throw new Error("boom"); }), file, "RepLog"), "failed");
});

test("iOS and iPadOS are detected for the save hint", () => {
  assert.equal(isIOSLike("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5), true);
  assert.equal(isIOSLike("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5), true); // iPadOS in desktop mode
  assert.equal(isIOSLike("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0), false);
  assert.equal(isIOSLike("Mozilla/5.0 (Linux; Android 14)", 5), false);
});
