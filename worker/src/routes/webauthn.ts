// WebAuthn / Passkeys — registration and authentication
// Uses Web Crypto API (crypto.subtle) directly — no external deps.
// RFC 8030 (Web Push), RFC 8391 (encryption), RFC 8392 (VAPID) are NOT needed here;
// this file handles RFC 6238 / W3C WebAuthn L2 only.

import { json } from '../index';
import { createJWT, verifyJWT } from '../lib/auth';
import type { Env } from '../index';

// ── RP config ────────────────────────────────────────────────────────────────

// Derive allowed origins from the APP_URL env var + localhost dev origins.
// No extra env var needed.
function getAllowedOrigins(env: Env): string[] {
  const prod = env.APP_URL || 'https://forzachang.pages.dev';
  return [prod, 'http://localhost:5173', 'http://localhost:4173'];
}

// RP ID is the registrable domain of the canonical origin.
function getRpId(env: Env): string {
  try {
    return new URL(env.APP_URL || 'https://forzachang.pages.dev').hostname;
  } catch {
    return 'forzachang.pages.dev';
  }
}

// ── Minimal CBOR decoder ─────────────────────────────────────────────────────
// Handles major types 0–5 only (uint, negint, bytes, text, array, map).
// That covers everything WebAuthn sends.

type CborValue = number | Uint8Array | string | CborValue[] | Map<CborValue, CborValue>;

function decodeCbor(buf: Uint8Array): CborValue {
  const [val] = decodeCborAt(buf, 0);
  return val;
}

function decodeCborAt(buf: Uint8Array, offset: number): [CborValue, number] {
  const initialByte = buf[offset++];
  const majorType = (initialByte >> 5) & 0x7;
  const additionalInfo = initialByte & 0x1f;

  let val: number;
  if (additionalInfo < 24) {
    val = additionalInfo;
  } else if (additionalInfo === 24) {
    val = buf[offset++];
  } else if (additionalInfo === 25) {
    val = (buf[offset] << 8) | buf[offset + 1];
    offset += 2;
  } else if (additionalInfo === 26) {
    val = ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
    offset += 4;
  } else {
    // We don't need 8-byte integers for WebAuthn
    throw new Error(`CBOR: unsupported additional info ${additionalInfo}`);
  }

  switch (majorType) {
    case 0: return [val, offset]; // uint
    case 1: return [-(val + 1), offset]; // negint
    case 2: { // bytes
      const bytes = buf.slice(offset, offset + val);
      return [bytes, offset + val];
    }
    case 3: { // text
      const bytes = buf.slice(offset, offset + val);
      return [new TextDecoder().decode(bytes), offset + val];
    }
    case 4: { // array
      const arr: CborValue[] = [];
      for (let i = 0; i < val; i++) {
        const [item, next] = decodeCborAt(buf, offset);
        arr.push(item);
        offset = next;
      }
      return [arr, offset];
    }
    case 5: { // map
      const map = new Map<CborValue, CborValue>();
      for (let i = 0; i < val; i++) {
        const [k, afterK] = decodeCborAt(buf, offset);
        const [v, afterV] = decodeCborAt(buf, afterK);
        map.set(k, v);
        offset = afterV;
      }
      return [map, offset];
    }
    default:
      throw new Error(`CBOR: unsupported major type ${majorType}`);
  }
}

// ── Base64url helpers ────────────────────────────────────────────────────────

function b64uEncode(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64uDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

// ── authenticatorData parser ─────────────────────────────────────────────────
// Layout: 32 bytes rpIdHash | 1 byte flags | 4 bytes counter | [attested credential data]

interface ParsedAuthData {
  rpIdHash: Uint8Array;
  flags: number;
  counter: number;
  credentialId?: Uint8Array;
  coseKey?: Map<CborValue, CborValue>;
}

function parseAuthData(authData: Uint8Array): ParsedAuthData {
  const rpIdHash = authData.slice(0, 32);
  const flags = authData[32];
  const counter = new DataView(authData.buffer, authData.byteOffset + 33, 4).getUint32(0, false);

  let credentialId: Uint8Array | undefined;
  let coseKey: Map<CborValue, CborValue> | undefined;

  const hasAttestedCredData = (flags & 0x40) !== 0;
  if (hasAttestedCredData) {
    // aaguid = 16 bytes, credentialIdLength = 2 bytes, credentialId, coseKey
    const credIdLen = new DataView(authData.buffer, authData.byteOffset + 37 + 16, 2).getUint16(0, false);
    credentialId = authData.slice(37 + 16 + 2, 37 + 16 + 2 + credIdLen);
    const coseStart = 37 + 16 + 2 + credIdLen;
    const coseBytes = authData.slice(coseStart);
    coseKey = decodeCbor(coseBytes) as Map<CborValue, CborValue>;
  }

  return { rpIdHash, flags, counter, credentialId, coseKey };
}

// ── COSE key → SubtleCrypto importKey ────────────────────────────────────────
// Supports ES256 (alg -7) and RS256 (alg -257).

async function importCoseKey(coseKey: Map<CborValue, CborValue>): Promise<{ key: CryptoKey; algorithm: number }> {
  const alg = coseKey.get(3) as number;

  if (alg === -7) {
    // ES256 — EC P-256
    const x = coseKey.get(-2) as Uint8Array;
    const y = coseKey.get(-3) as Uint8Array;
    const jwk = { kty: 'EC', crv: 'P-256', x: b64uEncode(x), y: b64uEncode(y) };
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
    return { key, algorithm: -7 };
  }

  if (alg === -257) {
    // RS256 — RSA-PKCS1-v1_5
    const n = coseKey.get(-1) as Uint8Array;
    const e = coseKey.get(-2) as Uint8Array;
    const jwk = { kty: 'RSA', alg: 'RS256', n: b64uEncode(n), e: b64uEncode(e), ext: true };
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['verify']);
    return { key, algorithm: -257 };
  }

  throw new Error(`Unsupported COSE algorithm: ${alg}`);
}

// ── DER → raw r‖s conversion for ES256 ──────────────────────────────────────
// WebAuthn returns DER SEQUENCE { INTEGER r, INTEGER s }.
// SubtleCrypto ECDSA verify needs raw 64-byte r‖s.

function derToRaw(der: Uint8Array): Uint8Array {
  // SEQUENCE
  let offset = 2; // skip 0x30 + length
  if (der[1] > 0x7f) offset += der[1] - 0x80; // long form length
  // r INTEGER
  offset++; // skip 0x02
  const rLen = der[offset++];
  const r = der.slice(offset, offset + rLen);
  offset += rLen;
  // s INTEGER
  offset++; // skip 0x02
  const sLen = der[offset++];
  const s = der.slice(offset, offset + sLen);

  // Pad to 32 bytes each (DER may prepend a 0x00 to keep the sign positive)
  const raw = new Uint8Array(64);
  raw.set(r.length > 32 ? r.slice(r.length - 32) : r, 32 - Math.min(r.length, 32));
  raw.set(s.length > 32 ? s.slice(s.length - 32) : s, 64 - Math.min(s.length, 32));
  return raw;
}

// ── Device name from User-Agent ──────────────────────────────────────────────

function guessDeviceName(ua: string): string {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Ukendt enhed';
}

// ── Challenge helpers ────────────────────────────────────────────────────────

async function createChallenge(env: Env, userId: string | null, type: 'register' | 'authenticate'): Promise<string> {
  // Prune stale challenges first
  await env.DB.prepare("DELETE FROM webauthn_challenges WHERE expires_at < datetime('now')").run();
  // Delete any existing challenge of this type for this user (one in-flight at a time)
  if (userId) {
    await env.DB.prepare('DELETE FROM webauthn_challenges WHERE user_id=? AND type=?').bind(userId, type).run();
  }

  const id = b64uEncode(crypto.getRandomValues(new Uint8Array(32)));
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min
  await env.DB.prepare('INSERT INTO webauthn_challenges (id, user_id, type, expires_at) VALUES (?,?,?,?)')
    .bind(id, userId, type, expires).run();
  return id;
}

async function consumeChallenge(env: Env, challengeId: string, type: 'register' | 'authenticate'): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT user_id FROM webauthn_challenges WHERE id=? AND type=? AND expires_at > datetime('now')"
  ).bind(challengeId, type).first() as any;
  if (!row) return null;
  await env.DB.prepare('DELETE FROM webauthn_challenges WHERE id=?').bind(challengeId).run();
  return row.user_id as string;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function handleWebAuthn(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // ── GET /api/auth/webauthn/register-options (authenticated) ──────────────
  if (path === '/api/auth/webauthn/register-options' && request.method === 'GET') {
    const payload = await requireAuth(request, env);
    if (!payload) return json({ error: 'Unauthorized' }, 401);

    const challenge = await createChallenge(env, payload.sub, 'register');
    const rpId = getRpId(env);

    return json({
      rp: { id: rpId, name: 'Copenhagen Forza Chang' },
      user: {
        id: b64uEncode(new TextEncoder().encode(payload.sub)),
        name: payload.sub,
        displayName: payload.name,
      },
      challenge,
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      timeout: 60000,
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'discouraged',
      },
      attestation: 'none',
    });
  }

  // ── POST /api/auth/webauthn/register-verify (authenticated) ──────────────
  if (path === '/api/auth/webauthn/register-verify' && request.method === 'POST') {
    const payload = await requireAuth(request, env);
    if (!payload) return json({ error: 'Unauthorized' }, 401);

    const body = await request.json() as {
      id: string;
      rawId: string;
      response: {
        clientDataJSON: string;
        attestationObject: string;
      };
      type: string;
    };

    // 1. Decode clientDataJSON
    const clientData = JSON.parse(new TextDecoder().decode(b64uDecode(body.response.clientDataJSON)));
    if (clientData.type !== 'webauthn.create') return json({ error: 'Ugyldig type' }, 400);

    // 2. Verify challenge (single-use)
    const challengeUserId = await consumeChallenge(env, clientData.challenge, 'register');
    if (!challengeUserId || challengeUserId !== payload.sub) {
      return json({ error: 'Ugyldig eller udløbet challenge' }, 400);
    }

    // 3. Verify origin
    const allowedOrigins = getAllowedOrigins(env);
    if (!allowedOrigins.includes(clientData.origin)) {
      return json({ error: 'Ugyldig origin' }, 400);
    }

    // 4. Decode attestationObject (CBOR)
    const attObjBytes = b64uDecode(body.response.attestationObject);
    const attObj = decodeCbor(attObjBytes) as Map<CborValue, CborValue>;
    const authData = attObj.get('authData') as Uint8Array;

    // 5. Verify rpIdHash
    const rpId = getRpId(env);
    const expectedRpIdHash = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId) as unknown as ArrayBuffer)
    );
    const { rpIdHash, flags, credentialId, coseKey } = parseAuthData(authData);
    if (!timingSafeEqual(rpIdHash, expectedRpIdHash)) {
      return json({ error: 'RP ID hash mismatch' }, 400);
    }

    // 6. Verify UP (user present) and UV (user verified) flags
    if (!(flags & 0x01)) return json({ error: 'Bruger ikke til stede' }, 400);
    if (!(flags & 0x04)) return json({ error: 'Bruger ikke verificeret' }, 400);

    if (!credentialId || !coseKey) return json({ error: 'Mangler credential data' }, 400);

    // 7. Import COSE key and export as SPKI
    const { key, algorithm } = await importCoseKey(coseKey);
    const spkiBuf = await crypto.subtle.exportKey('spki', key) as ArrayBuffer;
    const spki = b64uEncode(new Uint8Array(spkiBuf));

    // 8. Check credential ID is not already registered
    const credId = b64uEncode(credentialId);
    const existing = await env.DB.prepare('SELECT id FROM webauthn_credentials WHERE id=?').bind(credId).first();
    if (existing) return json({ error: 'Enhed allerede tilmeldt' }, 409);

    // 9. Store credential
    const ua = request.headers.get('User-Agent') || '';
    const deviceName = guessDeviceName(ua);
    const transports = JSON.stringify((body.response as any).transports || []);

    await env.DB.prepare(`
      INSERT INTO webauthn_credentials (id, user_id, public_key_spki, algorithm, counter, transports, device_name)
      VALUES (?,?,?,?,0,?,?)
    `).bind(credId, payload.sub, spki, algorithm, transports, deviceName).run();

    return json({ ok: true, device_name: deviceName });
  }

  // ── GET /api/auth/webauthn/credentials (authenticated) ───────────────────
  if (path === '/api/auth/webauthn/credentials' && request.method === 'GET') {
    const payload = await requireAuth(request, env);
    if (!payload) return json({ error: 'Unauthorized' }, 401);

    const rows = await env.DB.prepare(
      'SELECT id, device_name, created_at, last_used_at FROM webauthn_credentials WHERE user_id=? ORDER BY created_at DESC'
    ).bind(payload.sub).all();

    return json(rows.results);
  }

  // ── DELETE /api/auth/webauthn/credentials/:id (authenticated) ────────────
  const deleteMatch = path.match(/^\/api\/auth\/webauthn\/credentials\/([^/]+)$/);
  if (deleteMatch && request.method === 'DELETE') {
    const payload = await requireAuth(request, env);
    if (!payload) return json({ error: 'Unauthorized' }, 401);

    const credId = deleteMatch[1];
    // Only delete credentials owned by the current user
    const res = await env.DB.prepare('DELETE FROM webauthn_credentials WHERE id=? AND user_id=?')
      .bind(credId, payload.sub).run();
    if (res.meta.changes === 0) return json({ error: 'Ikke fundet' }, 404);
    return json({ ok: true });
  }

  // ── POST /api/auth/webauthn/login-options (public) ───────────────────────
  if (path === '/api/auth/webauthn/login-options' && request.method === 'POST') {
    const { username } = await request.json() as { username: string };

    const userId = username?.toLowerCase().trim();
    const creds = await env.DB.prepare(
      'SELECT id, transports FROM webauthn_credentials WHERE user_id=?'
    ).bind(userId).all();

    // Always generate a challenge — don't leak whether the email exists or has credentials
    const hasUser = await env.DB.prepare('SELECT id FROM players WHERE id=? AND active=1').bind(userId).first();
    const challengeUserId = (hasUser && creds.results.length > 0) ? userId : null;
    const challenge = await createChallenge(env, challengeUserId, 'authenticate');

    const rpId = getRpId(env);
    const allowCredentials = (hasUser && creds.results.length > 0)
      ? (creds.results as any[]).map((c: any) => ({
          type: 'public-key',
          id: c.id,
          transports: JSON.parse(c.transports || '[]'),
        }))
      : []; // empty = same generic response whether user exists or not

    return json({
      challenge,
      timeout: 60000,
      rpId,
      allowCredentials,
      userVerification: 'required',
    });
  }

  // ── POST /api/auth/webauthn/login-verify (public) ────────────────────────
  if (path === '/api/auth/webauthn/login-verify' && request.method === 'POST') {
    const body = await request.json() as {
      id: string;
      rawId: string;
      response: {
        clientDataJSON: string;
        authenticatorData: string;
        signature: string;
        userHandle?: string;
      };
      type: string;
    };

    // 1. Decode clientDataJSON
    const clientData = JSON.parse(new TextDecoder().decode(b64uDecode(body.response.clientDataJSON)));
    if (clientData.type !== 'webauthn.get') return json({ error: 'Ugyldig type' }, 400);

    // 2. Consume challenge
    const challengeUserId = await consumeChallenge(env, clientData.challenge, 'authenticate');
    // challengeUserId may be null if the challenge was created for a non-existent user — fail gracefully
    if (!challengeUserId) return json({ error: 'Ugyldig brugernavn eller biometri' }, 401);

    // 3. Look up credential
    const credId = body.id;
    const cred = await env.DB.prepare(
      'SELECT * FROM webauthn_credentials WHERE id=? AND user_id=?'
    ).bind(credId, challengeUserId).first() as any;
    if (!cred) return json({ error: 'Ugyldig brugernavn eller biometri' }, 401);

    // 4. Verify origin
    const allowedOrigins = getAllowedOrigins(env);
    if (!allowedOrigins.includes(clientData.origin)) {
      return json({ error: 'Ugyldig origin' }, 400);
    }

    // 5. Parse authenticatorData
    const authData = b64uDecode(body.response.authenticatorData);
    const { rpIdHash, flags, counter } = parseAuthData(authData);

    // 6. Verify rpIdHash
    const rpId = getRpId(env);
    const expectedRpIdHash = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId) as unknown as ArrayBuffer)
    );
    if (!timingSafeEqual(rpIdHash, expectedRpIdHash)) {
      return json({ error: 'RP ID hash mismatch' }, 400);
    }

    // 7. Verify UP + UV
    if (!(flags & 0x01)) return json({ error: 'Bruger ikke til stede' }, 400);
    if (!(flags & 0x04)) return json({ error: 'Bruger ikke verificeret' }, 400);

    // 8. Verify counter (replay protection)
    const storedCounter = cred.counter as number;
    if (storedCounter !== 0 && counter !== 0 && counter <= storedCounter) {
      return json({ error: 'Muligt replay-angreb' }, 400);
    }

    // 9. Import stored public key and verify signature
    const spkiBytes = b64uDecode(cred.public_key_spki);
    const alg = cred.algorithm as number;
    const importParams = alg === -7
      ? { name: 'ECDSA', namedCurve: 'P-256' }
      : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    const verifyParams = alg === -7
      ? { name: 'ECDSA', hash: 'SHA-256' }
      : { name: 'RSASSA-PKCS1-v1_5' };

    const pubKey = await crypto.subtle.importKey(
      'spki', spkiBytes.buffer as ArrayBuffer, importParams, false, ['verify']
    );

    // clientDataHash = SHA-256(clientDataJSON bytes)
    const clientDataBytes = b64uDecode(body.response.clientDataJSON);
    const clientDataHash = new Uint8Array(
      await crypto.subtle.digest('SHA-256', clientDataBytes.buffer as ArrayBuffer)
    );

    // verificationData = authData || clientDataHash
    const verificationData = new Uint8Array(authData.length + clientDataHash.length);
    verificationData.set(authData);
    verificationData.set(clientDataHash, authData.length);

    let sigBytes = b64uDecode(body.response.signature);
    if (alg === -7) {
      sigBytes = derToRaw(sigBytes); // DER → raw r‖s
    }

    const valid = await crypto.subtle.verify(
      verifyParams,
      pubKey,
      sigBytes.buffer as ArrayBuffer,
      verificationData.buffer as ArrayBuffer
    );

    if (!valid) return json({ error: 'Ugyldig signatur' }, 401);

    // 10. Update counter + last_used_at
    await env.DB.prepare(
      "UPDATE webauthn_credentials SET counter=?, last_used_at=datetime('now') WHERE id=?"
    ).bind(counter, credId).run();

    // 11. Issue JWT (same as password login)
    const player = await env.DB.prepare('SELECT * FROM players WHERE id=? AND active=1')
      .bind(challengeUserId).first() as any;
    if (!player) return json({ error: 'Ugyldig brugernavn eller biometri' }, 401);

    const token = await createJWT(
      { sub: player.id, name: player.name, role: player.role },
      env.JWT_SECRET
    );

    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || null;
    await env.DB.prepare('INSERT INTO login_log (id, player_id, ip) VALUES (?,?,?)')
      .bind(crypto.randomUUID(), player.id, ip).run();

    return json({
      token,
      player: { id: player.id, name: player.name, role: player.role, email: player.email, phone: player.phone },
    });
  }

  return json({ error: 'Not found' }, 404);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function requireAuth(request: Request, env: Env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyJWT(authHeader.slice(7), env.JWT_SECRET);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
