import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHECKIN_PHOTO_BUCKET,
  attachCheckinPhotoUrls,
  checkinPhotoPath,
  diffRemovedCheckinPhotoPaths,
  hasAnyCheckinPhoto,
  isValidCheckinPhotoPath,
  removeAllCheckinPhotoFiles,
  validateCheckinPhotoPaths,
} from "./checkin-photos.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const PHOTO_A = "3f2b8c1e-5a4d-4e6f-9a0b-1c2d3e4f5a6b";
const PHOTO_B = "4f2b8c1e-5a4d-4e6f-9a0b-1c2d3e4f5a6b";
const PHOTO_C = "5f2b8c1e-5a4d-4e6f-9a0b-1c2d3e4f5a6b";
const tEn = (_ro, en) => en;

test("checkinPhotoPath and isValidCheckinPhotoPath enforce user-scoped lowercase UUID jpeg paths", () => {
  const path = checkinPhotoPath(USER_ID, PHOTO_A.toUpperCase());
  assert.equal(path, `${USER_ID}/${PHOTO_A}.jpg`);
  assert.equal(isValidCheckinPhotoPath(path, USER_ID), true);

  // Rejects other users, traversal, uppercase, non-uuid, or wrong extension
  assert.equal(isValidCheckinPhotoPath(`${OTHER_USER}/${PHOTO_A}.jpg`, USER_ID), false);
  assert.equal(isValidCheckinPhotoPath(`${USER_ID}/../${PHOTO_A}.jpg`, USER_ID), false);
  assert.equal(isValidCheckinPhotoPath(`${USER_ID}/${PHOTO_A.toUpperCase()}.jpg`, USER_ID), false);
  assert.equal(isValidCheckinPhotoPath(`${USER_ID}/${PHOTO_A}.png`, USER_ID), false);
  assert.equal(isValidCheckinPhotoPath(`${USER_ID}/not-a-uuid.jpg`, USER_ID), false);
});

test("validateCheckinPhotoPaths accepts optional empty values and rejects invalid paths", () => {
  const empty = validateCheckinPhotoPaths({}, USER_ID, tEn);
  assert.deepEqual(empty, { ok: true, paths: { front: null, back: null, side: null } });

  const partial = validateCheckinPhotoPaths(
    { front: checkinPhotoPath(USER_ID, PHOTO_A), back: null, side: "" },
    USER_ID,
    tEn,
  );
  assert.deepEqual(partial, {
    ok: true,
    paths: { front: `${USER_ID}/${PHOTO_A}.jpg`, back: null, side: null },
  });

  const invalid = validateCheckinPhotoPaths(
    { front: `${OTHER_USER}/${PHOTO_A}.jpg` },
    USER_ID,
    tEn,
  );
  assert.equal(invalid.ok, false);
});

test("diffRemovedCheckinPhotoPaths detects replaced and cleared photos without dropping kept ones", () => {
  const pathA = checkinPhotoPath(USER_ID, PHOTO_A);
  const pathB = checkinPhotoPath(USER_ID, PHOTO_B);
  const pathC = checkinPhotoPath(USER_ID, PHOTO_C);

  const removed = diffRemovedCheckinPhotoPaths(
    { front: pathA, back: pathB, side: null },
    { front: pathA, back: pathC, side: null },
  );
  assert.deepEqual(removed, [pathB]);

  const clearedAll = diffRemovedCheckinPhotoPaths(
    { front: pathA, back: pathB, side: pathC },
    { front: null, back: null, side: null },
  );
  assert.deepEqual(clearedAll, [pathA, pathB, pathC]);
});

test("attachCheckinPhotoUrls batch-signs all check-in photo paths in one Storage call", async () => {
  const pathA = checkinPhotoPath(USER_ID, PHOTO_A);
  const pathB = checkinPhotoPath(USER_ID, PHOTO_B);
  const calls = [];
  const fakeSupabase = {
    storage: {
      from: (bucket) => ({
        createSignedUrls: async (paths) => {
          calls.push({ bucket, paths });
          return {
            data: paths.map((p) => ({ path: p, signedUrl: `https://signed.local/${p}` })),
            error: null,
          };
        },
      }),
    },
  };

  const rows = [
    {
      id: "c1",
      client_id: USER_ID,
      coach_id: OTHER_USER,
      enrollment_id: null,
      week_start: "2026-11-23",
      weight_kg: 80,
      energy: 4,
      sleep: 4,
      stress: 2,
      client_notes: null,
      photo_front_path: pathA,
      photo_back_path: null,
      photo_side_path: pathB,
      coach_reply: null,
      reviewed_at: null,
      created_at: "2026-11-24T10:00:00Z",
      updated_at: "2026-11-24T10:00:00Z",
    },
    {
      id: "c2",
      client_id: USER_ID,
      coach_id: OTHER_USER,
      enrollment_id: null,
      week_start: "2026-11-16",
      weight_kg: 80.5,
      energy: 4,
      sleep: 4,
      stress: 2,
      client_notes: null,
      photo_front_path: null,
      photo_back_path: null,
      photo_side_path: null,
      coach_reply: null,
      reviewed_at: null,
      created_at: "2026-11-17T10:00:00Z",
      updated_at: "2026-11-17T10:00:00Z",
    },
  ];

  const enriched = await attachCheckinPhotoUrls(fakeSupabase, rows);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bucket, CHECKIN_PHOTO_BUCKET);
  assert.deepEqual(calls[0].paths, [pathA, pathB]);
  assert.deepEqual(enriched[0].photoUrls, {
    front: `https://signed.local/${pathA}`,
    side: `https://signed.local/${pathB}`,
  });
  assert.equal(hasAnyCheckinPhoto(enriched[0].photoUrls), true);
  assert.deepEqual(enriched[1].photoUrls, {});
  assert.equal(hasAnyCheckinPhoto(enriched[1].photoUrls), false);
});

test("attachCheckinPhotoUrls tolerates missing bucket errors cleanly", async () => {
  const pathA = checkinPhotoPath(USER_ID, PHOTO_A);
  const fakeSupabase = {
    storage: {
      from: () => ({
        createSignedUrls: async () => ({ data: null, error: { message: "Bucket not found" } }),
      }),
    },
  };
  const enriched = await attachCheckinPhotoUrls(fakeSupabase, [{
    id: "c1",
    client_id: USER_ID,
    coach_id: OTHER_USER,
    enrollment_id: null,
    week_start: "2026-11-23",
    weight_kg: null,
    energy: 4,
    sleep: 4,
    stress: 2,
    client_notes: null,
    photo_front_path: pathA,
    photo_back_path: null,
    photo_side_path: null,
    coach_reply: null,
    reviewed_at: null,
    created_at: "2026-11-24T10:00:00Z",
    updated_at: "2026-11-24T10:00:00Z",
  }]);
  assert.deepEqual(enriched[0].photoUrls, {});
});

test("removeAllCheckinPhotoFiles targets the checkin-photos bucket", async () => {
  const bucketsUsed = [];
  const removed = [];
  let files = [{ name: `${PHOTO_A}.jpg` }, { name: `${PHOTO_B}.jpg` }];
  const fakeSupabase = {
    storage: {
      from: (bucket) => {
        bucketsUsed.push(bucket);
        return {
          list: async () => ({ data: files, error: null }),
          remove: async (paths) => {
            removed.push(...paths);
            files = [];
            return { error: null };
          },
        };
      },
    },
  };

  await removeAllCheckinPhotoFiles(fakeSupabase, USER_ID);
  assert.deepEqual(bucketsUsed, [CHECKIN_PHOTO_BUCKET]);
  assert.deepEqual(removed, [`${USER_ID}/${PHOTO_A}.jpg`, `${USER_ID}/${PHOTO_B}.jpg`]);
});
