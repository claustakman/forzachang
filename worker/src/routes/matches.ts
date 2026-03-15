import { json, Env } from '../index';
import { nanoid } from '../lib/auth';
import type { JWTPayload } from '../lib/auth';

export async function handleMatches(request: Request, env: Env, user: JWTPayload): Promise<Response> {
  const url = new URL(request.url);
  const id = url.pathname.split('/')[3];

  // GET /api/matches?season=2025
  if (request.method === 'GET' && !id) {
    const season = url.searchParams.get('season') || new Date().getFullYear().toString();
    const matches = await env.DB.prepare(
      `SELECT m.*, 
        (SELECT COUNT(*) FROM signups WHERE match_id = m.id AND status = 'yes') as signup_count
       FROM matches m
       WHERE m.season = ?
       ORDER BY m.date, m.time`
    ).bind(season).all();
    return json(matches.results, 200, env.APP_URL);
  }

  // GET /api/matches/:id/signups
  if (request.method === 'GET' && id && url.pathname.endsWith('/signups')) {
    const matchId = url.pathname.split('/')[3];
    const signups = await env.DB.prepare(
      `SELECT s.*, p.name as player_name FROM signups s
       JOIN players p ON p.id = s.player_id
       WHERE s.match_id = ? AND s.status = 'yes'
       ORDER BY p.name`
    ).bind(matchId).all();
    return json(signups.results, 200, env.APP_URL);
  }

  // POST /api/matches — admin only
  if (request.method === 'POST' && user.role === 'admin') {
    const body = await request.json() as any;
    const matchId = nanoid();
    await env.DB.prepare(
      `INSERT INTO matches (id, date, time, opponent, venue, address, season, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(matchId, body.date, body.time, body.opponent, body.venue || 'home',
      body.address || '', body.season || new Date().getFullYear().toString(), body.notes || '').run();
    return json({ id: matchId }, 201, env.APP_URL);
  }

  // DELETE /api/matches/:id — admin only
  if (request.method === 'DELETE' && id && user.role === 'admin') {
    await env.DB.prepare('DELETE FROM matches WHERE id = ?').bind(id).run();
    return json({ ok: true }, 200, env.APP_URL);
  }

  return json({ error: 'Method not allowed' }, 405, env.APP_URL);
}
