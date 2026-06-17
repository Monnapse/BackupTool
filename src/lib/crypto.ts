import crypto from "node:crypto";

// AES-256-GCM encryption for secrets at rest (passwords, OAuth tokens).
// The key is derived from APP_SECRET so config rows are useless without it.

const ALGO = "aes-256-gcm";

function key(): Buffer {
  const secret = process.env.APP_SECRET;
  if (!secret) {
    throw new Error("APP_SECRET is not set — cannot encrypt/decrypt secrets.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/** Encrypt a UTF-8 string. Returns "iv:tag:ciphertext" hex, or "" for empty input. */
export function encrypt(plain: string | undefined | null): string {
  if (!plain) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}

/** Decrypt a value produced by encrypt(). Returns "" for empty input. */
export function decrypt(payload: string | undefined | null): string {
  if (!payload) return "";
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) return "";
  const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
