// crypto.randomUUID() exists only in secure contexts (https, localhost): on http://<ip> it is undefined and
// offline saving would fail. getRandomValues is available everywhere and just as strong, so build a v4 id from it.
type RandomSource = { randomUUID?: () => string; getRandomValues?: <T extends ArrayBufferView>(array: T) => T };

export function randomId(source: RandomSource = globalThis.crypto): string {
  if (typeof source?.randomUUID === "function") return source.randomUUID();
  if (typeof source?.getRandomValues !== "function") throw new Error("No secure random source is available.");
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
