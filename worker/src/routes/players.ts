import { json, Env } from '../index';
import { nanoid, hashPassword } from '../lib/auth';
import type { JWTPayload } from '../lib/auth';

export async function handlePlayers(request: Request, env: Env, user: JWTPayload): Promise<Response> {
  const url = new URL(request.url);
  const id = url.pathname.split('/')[3];

  if (request.method === 'GET') {
    const includeInactive = url.searchParams.get('include_inactive') === '1' && user.role === 'admin';
    const query = includeInactive
      ? `SELECT id, name, email, role, active FROM players WHERE role != 'admin' ORDER BY active DESC, name`
      : `SELECT id, name, email, role, active FROM players WHERE active=1 AND role != 'admin' ORDER BY name`;
    const players = await env.DB.prepare(query).all();
    return json(players.results);
  }

  if (request.method === 'POST' && user.role === 'admin') {
    const { id: newId, name, email, role, password } = await request.json() as any;
    const hash = await hashPassword(password || 'forzachang123');
    await env.DB.prepare(
      'INSERT INTO players (id,name,email,password_hash,role) VALUES(?,?,?,?,?)'
    ).bind(newId.toLowerCase(), name, email || null, hash, role || 'player').run();
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
