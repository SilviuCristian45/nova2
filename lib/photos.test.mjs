import test from "node:test";
import assert from "node:assert/strict";
import { drivePhotoName, fitWithin, parsePhotoRow, photoPath, removeAllPhotoFiles } from "./photos.ts";

const ID = "3f2b8c1e-5a4d-4e6f-9a0b-1c2d3e4f5a6b";
const row = { id: ID, taken_on: "2026-11-10", pose: "front", note: "morning", size_bytes: 300000 };

test("paths and Drive names are derived from the ids", () => {
  assert.equal(photoPath("u1", ID), `u1/${ID}.jpg`);
  assert.equal(drivePhotoName(ID), `replog-photo-${ID}.jpg`);
});

test("fitWithin shrinks the long edge and never enlarges", () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(3000, 4000), { width: 1200, height: 1600 });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
});

test("parsePhotoRow keeps valid rows and ignores a foreign path", () => {
  assert.deepEqual(parsePhotoRow({ ...row, path: "someone-else/x.jpg" }, "u1"), { ...row, path: photoPath("u1", ID) });
  assert.equal(parsePhotoRow({ ...row, note: null }, "u1")?.note, null);
});

test("parsePhotoRow rejects invalid rows", () => {
  for (const bad of [null, "x", { ...row, id: "nope" }, { ...row, taken_on: "10.11.2026" }, { ...row, pose: "top" },
    { ...row, note: "x".repeat(281) }, { ...row, size_bytes: 0 }, { ...row, size_bytes: 6 * 1024 * 1024 }]) {
    assert.equal(parsePhotoRow(bad, "u1"), null);
  }
});

test("removeAllPhotoFiles empties the user's folder page by page", async () => {
  let files = Array.from({ length: 150 }, (_, i) => ({ name: `${i}.jpg` }));
  const removed = [];
  const client = { storage: { from: () => ({
    list: async () => ({ data: files.slice(0, 100), error: null }),
    remove: async (paths) => { removed.push(...paths); files = files.filter((f) => !paths.includes(`u1/${f.name}`)); return { error: null }; },
  }) } };
  await removeAllPhotoFiles(client, "u1");
  assert.equal(removed.length, 150);
  assert.equal(files.length, 0);
});

test("removeAllPhotoFiles ignores a missing bucket but not other errors", async () => {
  const failing = (message) => ({ storage: { from: () => ({ list: async () => ({ data: null, error: { message } }) }) } });
  await removeAllPhotoFiles(failing("Bucket not found"), "u1");
  await assert.rejects(removeAllPhotoFiles(failing("boom"), "u1"), /boom/);
});
