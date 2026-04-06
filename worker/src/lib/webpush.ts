// Web Push Protocol implementation for Cloudflare Workers
// RFC 8030 + RFC 8291 (aes128gcm) + RFC 8292 (VAPID)
// Uses only crypto.subtle — no Node.js dependencies

export interface PushMessage {
  title: string;
  body: string;
  url: string;
}

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(b64 + pad), c => c.charCodeAt(0));
}

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function numToBytes(n: number, len: number): Uint8Array {
  const buf = new Uint8Array(len);
  for (let i = len - 1; i >= 0; i--) { buf[i] = n & 0xff; n >>= 8; }
  return buf;
}

async function hkdfExpand(prk: CryptoKey, info: Uint8Array, len: number): Promise<Uint8Array> {
  const out = new Uint8Array(len);
  let prev = new Uint8Array(0);
  let offset = 0;
  for (let i = 1; offset < len; i++) {
    const block = await crypto.subtle.sign(
      'HMAC',
      prk,
      concat(prev, info, new Uint8Array([i]))
    );
    prev = new Uint8Array(block);
    out.set(prev.subarray(0, Math.min(prev.length, len - offset)), offset);
    offset += prev.length;
  }
  return out;
}

async function hkdf(
  salt: Uint8Array,
  ikm: ArrayBuffer,
  info: Uint8Array,
  len: number
): Promise<Uint8Array> {
  const hmacKey = await crypto.subtle.importKey(
    'raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const prk = await crypto.subtle.sign('HMAC', hmacKey, ikm);
  const prkKey = await crypto.subtle.importKey(
    'raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return hkdfExpand(prkKey, info, len);
}

async function makeVapidJWT(
  privateKeyJwk: JsonWebKey,
  audience: string,
  subject: string
): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const claims = { aud: audience, exp: now + 43200, sub: subject };

  const enc = (o: object) =>
    b64urlEncode(new TextEncoder().encode(JSON.stringify(o)));
  const sigInput = `${enc(header)}.${enc(claims)}`;

  const key = await crypto.subtle.importKey(
    'jwk', privateKeyJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(sigInput)
  );
  return `${sigInput}.${b64urlEncode(sig)}`;
}

// Convert raw 32-byte private key + 65-byte uncompressed public key to JWK
function rawKeysToJwk(privRaw: Uint8Array, pubRaw: Uint8Array): JsonWebKey {
  // pubRaw: [0x04, x(32), y(32)]
  const x = b64urlEncode(pubRaw.subarray(1, 33));
  const y = b64urlEncode(pubRaw.subarray(33, 65));
  const d = b64urlEncode(privRaw);
  return { kty: 'EC', crv: 'P-256', x, y, d };
}

export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  message: PushMessage,
  vapid: { publicKey: string; privateKey: string; subject: string }
): Promise<void> {
  const payload = new TextEncoder().encode(JSON.stringify(message));

  // Parse subscription keys
  const clientPubRaw = b64urlDecode(subscription.p256dh);  // 65 bytes uncompressed P-256
  const authSecret = b64urlDecode(subscription.auth);       // 16 bytes

  // Parse VAPID keys
  const vapidPubRaw = b64urlDecode(vapid.publicKey);   // 65 bytes
  const vapidPrivRaw = b64urlDecode(vapid.privateKey); // 32 bytes

  // ── Generate ephemeral ECDH key pair ────────────────────────────────────
  const senderKP = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']
  );
  const senderPubRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', senderKP.publicKey)
  );

  // ── ECDH shared secret ──────────────────────────────────────────────────
  const clientPubKey = await crypto.subtle.importKey(
    'raw', clientPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPubKey },
    senderKP.privateKey,
    256
  );

  // ── Key derivation (RFC 8291 aes128gcm) ─────────────────────────────────
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK_key = HKDF-SHA256(auth_secret, ecdh_secret, "WebPush: info\0" || ua_pub || as_pub, 32)
  const infoKey = concat(
    new TextEncoder().encode('WebPush: info\x00'),
    clientPubRaw,
    senderPubRaw
  );
  const prk = await hkdf(authSecret, sharedBits, infoKey, 32);

  // CEK = HKDF-SHA256(salt, prk, "Content-Encoding: aes128gcm\0", 16)
  const cek = await hkdf(
    salt,
    prk,
    new TextEncoder().encode('Content-Encoding: aes128gcm\x00'),
    16
  );

  // NONCE = HKDF-SHA256(salt, prk, "Content-Encoding: nonce\0", 12)
  const nonce = await hkdf(
    salt,
    prk,
    new TextEncoder().encode('Content-Encoding: nonce\x00'),
    12
  );

  // ── AES-128-GCM encryption ───────────────────────────────────────────────
  // Pad payload: append \x02 delimiter byte (end-of-record marker)
  const plaintext = concat(payload, new Uint8Array([2]));

  const aesKey = await crypto.subtle.importKey(
    'raw', cek, { name: 'AES-GCM' }, false, ['encrypt']
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext)
  );

  // ── aes128gcm content-encoding header ────────────────────────────────────
  // salt (16) + rs (4, big-endian uint32) + idlen (1) + keyid (65 = senderPubRaw)
  const rs = 4096;
  const header = concat(
    salt,
    numToBytes(rs, 4),
    new Uint8Array([senderPubRaw.length]),
    senderPubRaw
  );
  const body = concat(header, ciphertext);

  // ── VAPID authorization header ────────────────────────────────────────────
  const endpointUrl = new URL(subscription.endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
  const vapidJwk = rawKeysToJwk(vapidPrivRaw, vapidPubRaw);
  const jwt = await makeVapidJWT(vapidJwk, audience, vapid.subject);
  const vapidAuth = `vapid t=${jwt},k=${b64urlEncode(vapidPubRaw)}`;

  // ── Send the push request ─────────────────────────────────────────────────
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': vapidAuth,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body,
  });

  if (res.status === 410 || res.status === 404) {
    throw new Error('SUBSCRIPTION_GONE');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Push failed ${res.status}: ${text}`);
  }
}
