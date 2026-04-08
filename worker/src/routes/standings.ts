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
    const { team_type, season, position, league, played, won, drawn, lost, goals_for, goals_against, points, dai_standings_url } = body;
    if (!team_type || !season) return json({ error: 'team_type og season er påkrævet' }, 400);

    try {
      await env.DB.prepare(`
        INSERT INTO season_standings (id, team_type, season, position, league, played, won, drawn, lost, goals_for, goals_against, points, dai_standings_url, imported_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
      `).bind(crypto.randomUUID(), team_type, Number(season), position ?? null, league ?? null,
        played ?? null, won ?? null, drawn ?? null, lost ?? null,
        goals_for ?? null, goals_against ?? null, points ?? null, dai_standings_url ?? null
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
        goals_for=COALESCE(?,goals_for), goals_against=COALESCE(?,goals_against), points=COALESCE(?,points),
        dai_standings_url=?
      WHERE id=?
    `).bind(
      body.position ?? null, body.league ?? null,
      body.played ?? null, body.won ?? null, body.drawn ?? null, body.lost ?? null,
      body.goals_for ?? null, body.goals_against ?? null, body.points ?? null,
      body.dai_standings_url ?? null,
      standingId
    ).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}

// ── DAI-stilling fetch (kron-job) ─────────────────────────────────────────────
// Henter aktuel sæsons stilling fra DAI-sport og opdaterer season_standings

export async function fetchDAIStandings(env: Env): Promise<void> {
  const daiUrlSetting = await env.DB.prepare(
    "SELECT value FROM app_settings WHERE key='dai_standings_url'"
  ).first() as any;

  if (!daiUrlSetting?.value) return;

  const daiUrl = daiUrlSetting.value as string;
  const currentYear = new Date().getFullYear();

  // Tjek om vi har en row for indeværende sæson
  const standing = await env.DB.prepare(
    "SELECT id FROM season_standings WHERE team_type='oldboys' AND season=?"
  ).bind(currentYear).first() as any;

  try {
    const res = await fetch(daiUrl, { headers: { 'User-Agent': 'CFC/1.0' } });
    if (!res.ok) { console.error('DAI fetch failed:', res.status); return; }
    const html = await res.text();

    // Parser DAI-sport HTML tabel — find CFC-rækken
    // Formateksempel: <td>CFC</td><td>12</td><td>8</td><td>2</td><td>2</td><td>34:12</td><td>26</td>
    const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const row of rows) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m =>
        m[1].replace(/<[^>]+>/g, '').trim()
      );
      if (!cells.some(c => c.includes('CFC'))) continue;

      // Typisk kolonnerækkefølge: pos, hold, kampe, v, u, t, mål, point
      // Eller: hold, kampe, v, u, t, mål, point (uden pos)
      // Find position fra første kolonne
      let pos: number | null = null;
      let pl = 0, w = 0, d = 0, l = 0, gf = 0, ga = 0, pts = 0;

      // Prøv at parse — positionen er enten 0. felt (et tal) eller 1. felt er holdet
      const posIdx = !isNaN(Number(cells[0])) ? 0 : -1;
      const teamIdx = posIdx === 0 ? 1 : 0;

      if (posIdx >= 0) pos = Number(cells[posIdx]);
      // Felter efter holdnavn
      const dataStart = teamIdx + 1;
      pl  = Number(cells[dataStart]) || 0;
      w   = Number(cells[dataStart + 1]) || 0;
      d   = Number(cells[dataStart + 2]) || 0;
      l   = Number(cells[dataStart + 3]) || 0;
      // Mål: "34:12"
      const goals = (cells[dataStart + 4] || '').split(':');
      gf = Number(goals[0]) || 0;
      ga = Number(goals[1]) || 0;
      pts = Number(cells[dataStart + 5]) || 0;

      if (standing) {
        await env.DB.prepare(`
          UPDATE season_standings SET position=?, played=?, won=?, drawn=?, lost=?, goals_for=?, goals_against=?, points=?
          WHERE id=?
        `).bind(pos, pl, w, d, l, gf, ga, pts, standing.id).run();
      } else {
        await env.DB.prepare(`
          INSERT INTO season_standings (id, team_type, season, position, played, won, drawn, lost, goals_for, goals_against, points, dai_standings_url, imported_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
        `).bind(crypto.randomUUID(), 'oldboys', currentYear, pos, pl, w, d, l, gf, ga, pts, daiUrl).run();
      }
      break;
    }
  } catch (e) {
    console.error('DAI standings fetch error:', e);
  }
}
