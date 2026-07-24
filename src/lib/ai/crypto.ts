import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * AI 平台密钥的对称加解密（AES-256-GCM）。
 * 加密密钥由 AI_ENCRYPTION_KEY 或 AUTH_SECRET 派生，明文密钥只在服务端内存中短暂存在。
 * 存储格式：base64( iv[12] | authTag[16] | ciphertext )。
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;

function encKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.AI_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("缺少 AI_ENCRYPTION_KEY 或 AUTH_SECRET，无法加密 AI 密钥");
  }
  // 固定 salt：同一部署内密钥稳定，重启后仍能解出旧密文
  cachedKey = scryptSync(secret, "xedit-ai-key-v1", 32);
  return cachedKey;
}

/** 加密明文密钥；空串原样返回空串 */
export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, encKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/** 解密；空串或解密失败返回空串（视为未配置，不抛错阻断调用链） */
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

/** 用于回显的密钥末四位（不泄露完整密钥） */
export function keyLast4(plain: string): string {
  return plain.length >= 4 ? plain.slice(-4) : "";
}
