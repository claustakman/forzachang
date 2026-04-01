import { json, Env } from '../index';
import { nanoid, hashPassword } from '../lib/auth';
import type { JWTPayload } from '../lib/auth';

const AVATAR_PUBLIC_BASE = 'https://pub-afc843d1587d4ae3a4aa8f3d76547493.r2.dev';

export async function handlePlayers(request: Request, env: Env, user: JWTPayload): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[3];
  const sub = pathParts[4]; // e.g. "avatar"

  // POST /api/players/:id/avatar — upload profile picture to R2
  if (request.method === 'POST' && id && sub === 'avatar') {
    if (id !== user.sub && user.role !== 'admin') {
      return json({ error: 'Forbidden' }, 403);
    }

    const contentType = request.headers.get('Content-Type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return json({ error: 'Only image uploads are allowed' }, 400);
    }

    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const key = `avatars/${id}.${ext}`;

    const body = await request.arrayBuffer();
    if (body.byteLength > 5 * 1024 * 1024) {
      return json({ error: 'Image must be under 5 MB' }, 400);
    }

    await env.AVATARS.put(key, body, { httpMetadata: { contentType } });

    const avatar_url = `${AVATAR_PUBLIC_BASE}/${key}`;
    await env.DB.prepare('UPDATE players SET avatar_url=? WHERE id=?').bind(avatar_url, id).run();

    return json({ ok: true, avatar_url });
  }

  // GET /api/players/:id/logins — login-log for spiller (kun admin)
  if (request.method === 'GET' && id && sub === 'logins') {
    if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    const logs = await env.DB.prepare(
      'SELECT id, ip, created_at FROM login_log WHERE player_id = ? ORDER BY created_at DESC LIMIT 50'
    ).bind(id).all();
    return json(logs.results);
  }

  if (request.method === 'GET') {
    const includeInactive = url.searchParams.get('include_inactive') === '1' && user.role === 'admin';
    const query = includeInactive
      ? `SELECT id, name, alias, email, role, active, birth_date, shirt_number, license_number, avatar_url, last_seen FROM players ORDER BY active DESC, CASE WHEN shirt_number IS NULL THEN 1 ELSE 0 END, shirt_number`
      : `SELECT id, name, alias, email, role, active, birth_date, shirt_number, license_number, avatar_url, last_seen FROM players WHERE active=1 ORDER BY CASE WHEN shirt_number IS NULL THEN 1 ELSE 0 END, shirt_number`;
    const players = await env.DB.prepare(query).all();
    return json(players.results);
  }

  if (request.method === 'POST' && user.role === 'admin') {
    const { id: newId, name, email, role, password, birth_date, shirt_number, license_number } = await request.json() as any;
    const hash = await hashPassword(password || 'forzachang123');
    await env.DB.prepare(
      'INSERT INTO players (id,name,email,password_hash,role,birth_date,shirt_number,license_number) VALUES(?,?,?,?,?,?,?,?)'
    ).bind(newId.toLowerCase(), name, email || null, hash, role || 'player', birth_date || null, shirt_number || null, license_number || null).run();
    return json({ ok: true }, 201);
  }

  if (request.method === 'PUT' && id) {
    if (id !== user.sub && user.role !== 'admin') {
      return json({ error: 'Forbidden' }, 403);
    }
    const body = await request.json() as any;
    if (body.password) {
      const hash = await hashPassword(body.password);
      await env.DB.prepare('UPDATE players SET password_hash=? WHERE id=?').bind(hash, id).run();
    }
    if (body.name !== undefined && user.role === 'admin') {
      await env.DB.prepare('UPDATE players SET name=? WHERE id=?').bind(body.name, id).run();
    }
    if (body.email !== undefined) {
      await env.DB.prepare('UPDATE players SET email=? WHERE id=?').bind(body.email, id).run();
    }
    if (body.role !== undefined && user.role === 'admin') {
      await env.DB.prepare('UPDATE players SET role=? WHERE id=?').bind(body.role, id).run();
    }
    if (body.active !== undefined && user.role === 'admin') {
      await env.DB.prepare('UPDATE players SET active=? WHERE id=?').bind(body.active ? 1 : 0, id).run();
    }
    if (body.birth_date !== undefined && user.role === 'admin') {
      await env.DB.prepare('UPDATE players SET birth_date=? WHERE id=?').bind(body.birth_date || null, id).run();
    }
    if (body.shirt_number !== undefined && user.role === 'admin') {
      await env.DB.prepare('UPDATE players SET shirt_number=? WHERE id=?').bind(body.shirt_number || null, id).run();
    }
    if (body.license_number !== undefined && user.role === 'admin') {
      await env.DB.prepare('UPDATE players SET license_number=? WHERE id=?').bind(body.license_number || null, id).run();
    }
    if (body.phone !== undefined) {
      await env.DB.prepare('UPDATE players SET phone=? WHERE id=?').bind(body.phone || null, id).run();
    }
    // alias: self eller admin kan sætte
    if (body.alias !== undefined) {
      await env.DB.prepare('UPDATE players SET alias=? WHERE id=?').bind(body.alias || null, id).run();
    }
    return json({ ok: true });
  }

  if (request.method === 'DELETE' && id && user.role === 'admin') {
    if (url.searchParams.get('permanent') === '1') {
      await env.DB.prepare('DELETE FROM players WHERE id=?').bind(id).run();
    } else {
      await env.DB.prepare('UPDATE players SET active=0 WHERE id=?').bind(id).run();
    }
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
