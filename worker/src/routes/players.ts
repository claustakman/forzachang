import { json, Env } from '../index';
import { nanoid, hashPassword } from '../lib/auth';
import type { JWTPayload } from '../lib/auth';

// ── Signups ──────────────────────────────────────────────────────────────────

export async function handleSignups(request: Request, env: Env, user: JWTPayload): Promise<Response> {
  const url = new URL(request.url);

  // GET /api/signups?match_id=x — my signup status
  if (request.method === 'GET') {
    const matchId = url.searchParams.get('match_id');
    if (!matchId) return json({ error: 'match_id required' }, 400, env.APP_URL);
    const row = await env.DB.prepare(
      'SELECT * FROM signups WHERE match_id = ? AND player_id = ?'
    ).bind(matchId, user.sub).first();
    return json(row || null, 200, env.APP_URL);
  }

  // POST /api/signups — toggle signup
  if (request.method === 'POST') {
    const { match_id, status } = await request.json() as { match_id: string; status: 'yes' | 'no' };
    const existing = await env.DB.prepare(
      'SELECT id FROM signups WHERE match_id = ? AND player_id = ?'
    ).bind(match_id, user.sub).first();

    if (existing) {
      await env.DB.prepare(
        'UPDATE signups SET status = ? WHERE match_id = ? AND player_id = ?'
      ).bind(status, match_id, user.sub).run();
    } else {
      await env.DB.prepare(
        'INSERT INTO signups (id, match_id, player_id, status) VALUES (?, ?, ?, ?)'
      ).bind(nanoid(), match_id, user.sub, status).run();
    }
    return json({ ok: true }, 200, env.APP_URL);
  }

  return json({ error: 'Method not allowed' }, 405, env.APP_URL);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function handleStats(request: Request, env: Env, user: JWTPayload): Promise<Response> {
  const url = new URL(request.url);

  // GET /api/stats?season=2025 — aggregated stats for all players
  if (request.method === 'GET') {
    const season = url.searchParams.get('season');
    const playerId = url.searchParams.get('player_id');

    if (playerId) {
      // Career stats for one player
      const stats = await env.DB.prepare(`
        SELECT 
          COALESCE(SUM(s.played), 0) as matches,
          COALESCE(SUM(s.goals), 0) as goals,
          COALESCE(SUM(s.yellow_cards), 0) as yellow_cards,
          COALESCE(SUM(s.red_cards), 0) as red_cards,
          m.season
        FROM stats s
        JOIN matches m ON m.id = s.match_id
        WHERE s.player_id = ?
        GROUP BY m.season
        ORDER BY m.season DESC
      `).bind(playerId).all();
      return json(stats.results, 200, env.APP_URL);
    }

    const seasonFilter = season ? 'AND m.season = ?' : '';
    const query = `
      SELECT 
        p.id, p.name,
        COALESCE(SUM(s.played), 0) as matches,
        COALESCE(SUM(s.goals), 0) as goals,
        COALESCE(SUM(s.yellow_cards), 0) as yellow_cards,
        COALESCE(SUM(s.red_cards), 0) as red_cards
      FROM players p
      LEFT JOIN stats s ON s.player_id = p.id
      LEFT JOIN matches m ON m.id = s.match_id ${seasonFilter}
      WHERE p.active = 1 AND p.role != 'admin'
      GROUP BY p.id, p.name
      ORDER BY goals DESC, matches DESC
    `;
    const rows = season
      ? await env.DB.prepare(query).bind(season).all()
      : await env.DB.prepare(query).all();
    return json(rows.results, 200, env.APP_URL);
  }

  // POST /api/stats — admin only, record match stats
  if (request.method === 'POST' && (user.role === 'admin')) {
    const { match_id, player_id, goals, yellow_cards, red_cards, played } = await request.json() as any;
    const existing = await env.DB.prepare(
      'SELECT id FROM stats WHERE match_id = ? AND player_id = ?'
    ).bind(match_id, player_id).first();

    if (existing) {
      await env.DB.prepare(
        'UPDATE stats SET goals=?,yellow_cards=?,red_cards=?,played=? WHERE match_id=? AND player_id=?'
      ).bind(goals || 0, yellow_cards || 0, red_cards || 0, played ?? 1, match_id, player_id).run();
    } else {
      await env.DB.prepare(
        'INSERT INTO stats (id,match_id,player_id,goals,yellow_cards,red_cards,played) VALUES(?,?,?,?,?,?,?)'
      ).bind(nanoid(), match_id, player_id, goals || 0, yellow_cards || 0, red_cards || 0, played ?? 1).run();
    }
    return json({ ok: true }, 200, env.APP_URL);
  }

  return json({ error: 'Method not allowed' }, 405, env.APP_URL);
}

// ── Fines ─────────────────────────────────────────────────────────────────────

export async function handleFines(request: Request, env: Env, user: JWTPayload): Promise<Response> {
  const url = new URL(request.url);
  const id = url.pathname.split('/')[3];

  // GET /api/fines — all fines (everyone can see)
  if (request.method === 'GET' && !id) {
    const fines = await env.DB.prepare(`
      SELECT f.*, p.name as player_name, ft.name as fine_type_name, ib.name as issued_by_name
      FROM fines f
      JOIN players p ON p.id = f.player_id
      JOIN fine_types ft ON ft.id = f.fine_type_id
      JOIN players ib ON ib.id = f.issued_by
      ORDER BY f.created_at DESC
    `).all();
    const types = await env.DB.prepare('SELECT * FROM fine_types WHERE active=1 ORDER BY name').all();
    const totals = await env.DB.prepare(`
      SELECT player_id, p.name, SUM(amount) as total, SUM(CASE WHEN paid=1 THEN amount ELSE 0 END) as paid
      FROM fines f JOIN players p ON p.id=f.player_id
      GROUP BY player_id ORDER BY total DESC
    `).all();
    return json({ fines: fines.results, types: types.results, totals: totals.results }, 200, env.APP_URL);
  }

  // POST /api/fines — treasurer or admin only
  if (request.method === 'POST' && (user.role === 'admin' || user.role === 'treasurer')) {
    const { player_id, fine_type_id, reason } = await request.json() as any;
    const fineType = await env.DB.prepare('SELECT amount FROM fine_types WHERE id=?').bind(fine_type_id).first();
    if (!fineType) return json({ error: 'Ukendt bødetype' }, 400, env.APP_URL);
    await env.DB.prepare(
      'INSERT INTO fines (id,player_id,fine_type_id,amount,reason,issued_by) VALUES(?,?,?,?,?,?)'
    ).bind(nanoid(), player_id, fine_type_id, fineType.amount, reason || '', user.sub).run();
    return json({ ok: true }, 201, env.APP_URL);
  }

  // PUT /api/fines/:id/pay — mark as paid
  if (request.method === 'PUT' && id && (user.role === 'admin' || user.role === 'treasurer')) {
    await env.DB.prepare('UPDATE fines SET paid=1 WHERE id=?').bind(id).run();
    return json({ ok: true }, 200, env.APP_URL);
  }

  // DELETE /api/fines/:id — admin only
  if (request.method === 'DELETE' && id && user.role === 'admin') {
    await env.DB.prepare('DELETE FROM fines WHERE id=?').bind(id).run();
    return json({ ok: true }, 200, env.APP_URL);
  }

  return json({ error: 'Method not allowed' }, 405, env.APP_URL);
}

// ── Players ───────────────────────────────────────────────────────────────────

export async function handlePlayers(request: Request, env: Env, user: JWTPayload): Promise<Response> {
  const url = new URL(request.url);
  const id = url.pathname.split('/')[3];

  // GET /api/players — admin kan hente passive med ?include_inactive=1
  if (request.method === 'GET') {
    const includeInactive = url.searchParams.get('include_inactive') === '1' && user.role === 'admin';
    const query = includeInactive
      ? `SELECT id, name, email, role, active FROM players WHERE role != 'admin' ORDER BY active DESC, name`
      : `SELECT id, name, email, role, active FROM players WHERE active=1 AND role != 'admin' ORDER BY name`;
    const players = await env.DB.prepare(query).all();
    return json(players.results, 200, env.APP_URL);
  }

  // POST /api/players — admin only, create player
  if (request.method === 'POST' && user.role === 'admin') {
    const { id: newId, name, email, role, password } = await request.json() as any;
    const hash = await hashPassword(password || 'forzachang123');
    await env.DB.prepare(
      'INSERT INTO players (id,name,email,password_hash,role) VALUES(?,?,?,?,?)'
    ).bind(newId.toLowerCase(), name, email || null, hash, role || 'player').run();
    return json({ ok: true }, 201, env.APP_URL);
  }

  // PUT /api/players/:id — update own profile, or admin updates anyone
  if (request.method === 'PUT' && id) {
    if (id !== user.sub && user.role !== 'admin') {
      return json({ error: 'Forbidden' }, 403, env.APP_URL);
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
    return json({ ok: true }, 200, env.APP_URL);
  }

  // DELETE /api/players/:id — admin only (soft delete / deaktiver)
  if (request.method === 'DELETE' && id && user.role === 'admin') {
    await env.DB.prepare('UPDATE players SET active=0 WHERE id=?').bind(id).run();
    return json({ ok: true }, 200, env.APP_URL);
  }

  return json({ error: 'Method not allowed' }, 405, env.APP_URL);
}
