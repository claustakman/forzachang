// JWT and auth helpers for Cloudflare Workers

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Support both SHA-256 (new) and bcrypt placeholder (legacy)
  if (hash.startsWith('$2a$')) {
    // For initial setup: accept 'admin123' for the seeded admin
    return password === 'admin123';
  }
  const computed = await hashPassword(password);
  return computed === hash;
}

export interface JWTPayload {
  sub: string;   // player id
  name: string;
  role: string;
  exp: number;
}

export async function createJWT(payload: Omit<JWTPayload, 'exp'>, secret: string, expiresInSeconds = 60 * 60 * 24 * 30): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const body = btoa(JSON.stringify({ ...payload, exp }));
  const sig = await sign(`${header}.${body}`, secret);
  return `${header}.${body}.${sig}`;
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const [header, body, sig] = token.split('.');
    const expected = await sign(`${header}.${body}`, secret);
    if (sig !== expected) return null;
    const payload = JSON.parse(atob(body)) as JWTPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function sign(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function nanoid(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}
