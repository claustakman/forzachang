import { json, Env } from '../index';
import type { JWTPayload } from '../lib/auth';

export async function handleStandings(
  request: Request,
  env: Env,
  user: JWTPayload,
  standingId?: string,
): Promise<Response> {
  const isAdmin = user.role === 'admin';
  const url = new URL(request.url);

  // ── GET /api/standings/matches ─────────────────────────────────────────────
  if (request.method === 'GET' && url.pathname.endsWith('/matches')) {
    const opponent  = url.searchParams.get('opponent') || '';
    const teamType  = url.searchParams.get('team_type') || '';
    const season    = url.searchParams.get('season') || '';

    let query = 'SELECT * FROM season_matches WHERE 1=1';
    const params: any[] = [];

    if (opponent) { query += ' AND opponent LIKE ?'; params.push(`%${opponent}%`); }
    if (teamType) { query += ' AND team_type = ?'; params.push(teamType); }
    if (season)   { query += ' AND season = ?'; params.push(Number(season)); }

    query += ' ORDER BY season DESC, match_date ASC';

    const rows = await env.DB.prepare(query).bind(...params).all();
    return json(rows.results);
  }

  // ── GET /api/standings ─────────────────────────────────────────────────────
  if (request.method === 'GET') {
    const teamType = url.searchParams.get('team_type') || '';
    const season   = url.searchParams.get('season') || '';

    let query = 'SELECT * FROM season_standings WHERE 1=1';
    const params: any[] = [];
    if (teamType) { query += ' AND team_type = ?'; params.push(teamType); }
    if (season)   { query += ' AND season = ?'; params.push(Number(season)); }
    query += ' ORDER BY season DESC';

    const rows = await env.DB.prepare(query).bind(...params).all();
    return json(rows.results);
  }

  // ── POST /api/standings (admin) ────────────────────────────────────────────
  if (request.method === 'POST') {
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);
    const body = await request.json() as any;
    const { team_type, season, position, league, played, won, drawn, lost, goals_for, goals_against, points } = body;
    if (!team_type || !season) return json({ error: 'team_type og season er påkrævet' }, 400);

    try {
      await env.DB.prepare(`
        INSERT INTO season_standings (id, team_type, season, position, league, played, won, drawn, lost, goals_for, goals_against, points, imported_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
      `).bind(crypto.randomUUID(), team_type, Number(season), position ?? null, league ?? null,
        played ?? null, won ?? null, drawn ?? null, lost ?? null,
        goals_for ?? null, goals_against ?? null, points ?? null
      ).run();
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) return json({ error: 'Stilling for denne sæson + holdtype eksisterer allerede' }, 409);
      throw e;
    }
    return json({ ok: true });
  }

  // ── PUT /api/standings/:id (admin) ────────────────────────────────────────
  if (request.method === 'PUT' && standingId) {
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);
    const body = await request.json() as any;
    await env.DB.prepare(`
      UPDATE season_standings SET
        position=COALESCE(?,position), league=COALESCE(?,league),
        played=COALESCE(?,played), won=COALESCE(?,won), drawn=COALESCE(?,drawn), lost=COALESCE(?,lost),
        goals_for=COALESCE(?,goals_for), goals_against=COALESCE(?,goals_against), points=COALESCE(?,points)
      WHERE id=?
    `).bind(
      body.position ?? null, body.league ?? null,
      body.played ?? null, body.won ?? null, body.drawn ?? null, body.lost ?? null,
      body.goals_for ?? null, body.goals_against ?? null, body.points ?? null,
      standingId
    ).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}

