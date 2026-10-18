import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function hmacSha256(secret: string | Buffer, data: string | Buffer, encoding: 'hex' | 'base64url' = 'hex'): string {
  return createHmac('sha256', secret).update(data).digest(encoding);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** AES-256-GCM. Output: base64(iv | tag | ciphertext). Key: base64 of 32 bytes. */
export function encrypt(plaintext: string, keyB64: string): string {
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) throw new Error('CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (base64)');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

export function decrypt(payload: string, keyB64: string): string {
  const key = Buffer.from(keyB64, 'base64');
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}
