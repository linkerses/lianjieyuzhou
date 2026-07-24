import crypto from 'crypto';

interface AuthTokenPayload {
  cid: string;
  ts: number;
}

const TOKEN_PREFIX = 'v1';

export function generateToken(cid: string): string {
  const payload: AuthTokenPayload = { cid, ts: Date.now() };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${TOKEN_PREFIX}.${encodedPayload}.${signature}`;
}

export function verifyToken(token: string): AuthTokenPayload | null {
  const signedPayload = verifySignedToken(token);
  if (signedPayload) return signedPayload;

  // Backward compatibility for V0.2 tokens issued before signed auth.
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    if (typeof decoded.cid === 'string' && decoded.cid.length > 0) {
      return { cid: decoded.cid, ts: Number(decoded.ts || 0) };
    }
  } catch {
    return null;
  }

  return null;
}

export function isDevLoginEnabled() {
  return process.env.ENABLE_DEV_LOGIN !== 'false';
}

function verifySignedToken(token: string): AuthTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;

  const [, encodedPayload, signature] = parts;
  const expected = sign(encodedPayload);
  if (!safeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as AuthTokenPayload;
    if (typeof payload.cid !== 'string' || payload.cid.length === 0) return null;
    return { cid: payload.cid, ts: Number(payload.ts || 0) };
  } catch {
    return null;
  }
}

function sign(value: string) {
  return crypto
    .createHmac('sha256', getTokenSecret())
    .update(value)
    .digest('base64url');
}

function getTokenSecret() {
  return process.env.AUTH_TOKEN_SECRET
    || process.env.ADMIN_TOKEN
    || process.env.SUPABASE_SERVICE_KEY
    || 'lianjie-agent-dev-secret';
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf-8');
}
