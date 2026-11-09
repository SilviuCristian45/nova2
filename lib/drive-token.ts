import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Google refresh tokens are stored encrypted (AES-256-GCM). The key is DRIVE_TOKEN_KEY: 32 random bytes, base64.
// Stored value: base64(iv[12] | tag[16] | ciphertext).

function key(raw = process.env.DRIVE_TOKEN_KEY): Buffer {
  const bytes = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (bytes.length !== 32) throw new Error("DRIVE_TOKEN_KEY must be 32 bytes, base64-encoded");
  return bytes;
}

export function encryptToken(token: string, rawKey?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(rawKey), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decryptToken(stored: string, rawKey?: string): string {
  const data = Buffer.from(stored, "base64");
  if (data.length < 29) throw new Error("Stored Drive token is corrupt");
  const decipher = createDecipheriv("aes-256-gcm", key(rawKey), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}
