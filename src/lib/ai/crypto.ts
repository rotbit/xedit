import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * Symmetric encryption for AI provider keys (AES-256-GCM).
 * The encryption key is derived from AI_ENCRYPTION_KEY or AUTH_SECRET; plaintext keys exist only briefly in server memory.
 * Storage format: base64( iv[12] | authTag[16] | ciphertext ).
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;

function encKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.AI_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("缺少 AI_ENCRYPTION_KEY 或 AUTH_SECRET，无法加密 AI 密钥"); // i18n-ignore deployment misconfiguration, meant for ops
  }
  // Fixed salt: keys stay stable within a deployment, so old ciphertext still decrypts after a restart
  cachedKey = scryptSync(secret, "xedit-ai-key-v1", 32);
  return cachedKey;
}

/** Encrypts a plaintext key; an empty string returns an empty string */
export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, encKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/** Decrypts; returns an empty string for empty input or failure (treated as not configured, without throwing and breaking the call chain) */
export function decryptSecret(stored: string): string {
  if (!stored) return "";
  try {
    const raw = Buffer.from(stored, "base64");
    const iv = raw.subarray(0, IV_LEN);
    const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = raw.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, encKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

/** Last four characters of the key for display (doesn't reveal the full key) */
export function keyLast4(plain: string): string {
  return plain.length >= 4 ? plain.slice(-4) : "";
}
