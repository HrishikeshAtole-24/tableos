import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { hmacSha256, safeEqual } from '../../lib/crypto';

// ───── Supabase access tokens (dashboard users) ─────

export interface SupabaseClaims extends JWTPayload {
  sub: string;
  email?: string;
  phone?: string;
  role?: string;
  aal?: string;
  user_metadata?: { name?: string; full_name?: string };
}

export interface SupabaseVerifier {
  verify(token: string): Promise<SupabaseClaims>;
}

/**
 * Supabase signs access tokens with HS256 (legacy JWT secret) or with an asymmetric key
 * published at /auth/v1/.well-known/jwks.json. Accept both.
 */
export function createSupabaseVerifier(supabaseUrl: string, jwtSecret: string): SupabaseVerifier {
  const secret = new TextEncoder().encode(jwtSecret);
  const jwks = createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', supabaseUrl), {
    cooldownDuration: 60_000,
    cacheMaxAge: 10 * 60_000,
  });
  return {
    async verify(token) {
      const { alg } = decodeProtectedHeader(token);
      const opts = { audience: 'authenticated' };
      const { payload } = alg === 'HS256' ? await jwtVerify(token, secret, opts) : await jwtVerify(token, jwks, opts);
      if (!payload.sub) throw new Error('Token has no subject');
      return payload as SupabaseClaims;
    },
  };
}

// ───── QR tokens (printed on tables) ─────

/**
 * QR token = base64url(restaurantId.tableId.qrVersion) + "." + HMAC-SHA256 signature.
 * Raising qr_version invalidates older printed codes.
 */
export function signQrToken(secret: string, restaurantId: string, tableId: string, qrVersion: number): string {
  const body = Buffer.from(`${restaurantId}.${tableId}.${qrVersion}`).toString('base64url');
  return `${body}.${hmacSha256(secret, body, 'base64url').slice(0, 32)}`;
}

export interface QrPayload {
  restaurantId: string;
  tableId: string;
  qrVersion: number;
}

export function verifyQrToken(secret: string, token: string): QrPayload | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  if (!safeEqual(sig, hmacSha256(secret, body, 'base64url').slice(0, 32))) return null;
  const parts = Buffer.from(body, 'base64url').toString('utf8').split('.');
  if (parts.length !== 3) return null;
  const [restaurantId, tableId, v] = parts as [string, string, string];
  const qrVersion = Number(v);
  if (!Number.isInteger(qrVersion) || qrVersion < 1) return null;
  return { restaurantId, tableId, qrVersion };
}

// ───── Table session tokens (diners) ─────

export interface SessionTokenClaims {
  sid: string;
  rid: string;
  tid: string;
}

const SESSION_ISSUER = 'tableos:session';

export async function signSessionToken(secret: string, claims: SessionTokenClaims): Promise<string> {
  return new SignJWT({ rid: claims.rid, tid: claims.tid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sid)
    .setIssuer(SESSION_ISSUER)
    .setIssuedAt()
    // Hard ceiling; the real expiry is session close or 4 hours idle, checked in the DB.
    .setExpirationTime('24h')
    .sign(new TextEncoder().encode(secret));
}

export async function verifySessionToken(secret: string, token: string): Promise<SessionTokenClaims> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: SESSION_ISSUER });
  if (!payload.sub || typeof payload.rid !== 'string' || typeof payload.tid !== 'string') {
    throw new Error('Malformed session token');
  }
  return { sid: payload.sub, rid: payload.rid, tid: payload.tid };
}
