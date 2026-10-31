import type { OfflineMutation } from "./types";

// A rejected entry stays on the device until the user decides; this is the file they can keep before discarding it.
export function rejectedEntryExport(mutation: OfflineMutation): { filename: string; json: string } {
  const payload = mutation.payload;
  const date = payload.date;
  return {
    filename: `replog-rejected-${payload.kind}-${date}-${mutation.id}.json`,
    json: JSON.stringify({
      format: "replog-rejected-entry",
      version: 1,
      reason: mutation.rejected?.reason ?? null,
      rejectedAt: mutation.rejected?.at ?? null,
      entry: { id: mutation.id, ownerId: mutation.ownerId, createdAt: mutation.createdAt, payload },
    }, null, 2),
  };
}
