import { json, Env } from '../index';
import type { JWTPayload } from '../lib/auth';

export async function handleHonors(
  request: Request,
  env: Env,
  user: JWTPayload,
  honorId?: string,
): Promise<Response> {
  const isAdmin = user.role === 'admin';
  const url = new URL(request.url);

  // ── GET /api/honors/summary ────────────────────────────────────────────────
  if (request.method === 'GET' && url.pathname.endsWith('/summary')) {
    // Alle hædersbevisninger aggregeret per type
    const types = await env.DB.prepare(
      'SELECT * FROM honor_types ORDER BY sort_order, name'
    ).all();

    const honors = await env.DB.prepare(`
      SELECT ph.*, ht.key as honor_key, ht.name as honor_name, ht.type as honor_type,
        COALESCE(p.alias, p.name) as player_name, p.id as player_id, p.avatar_url,
        p.active as player_active
      FROM player_honors ph
      JOIN honor_types ht ON ht.id = ph.honor_type_id
      JOIN players p ON p.id = ph.player_id
      ORDER BY ht.sort_order, ph.season DESC NULLS LAST, player_name
    `).all();

    return json({ types: types.results, honors: honors.results });
  }

  // ── GET /api/honors?player_id= ────────────────────────────────────────────
  if (request.method === 'GET') {
    const playerId = url.searchParams.get('player_id');

    if (playerId) {
      const honors = await env.DB.prepare(`
        SELECT ph.*, ht.key as honor_key, ht.name as honor_name,
          ht.type as honor_type, ht.sort_order
        FROM player_honors ph
        JOIN honor_types ht ON ht.id = ph.honor_type_id
        WHERE ph.player_id = ?
        ORDER BY ht.sort_order, ph.season DESC
      `).bind(playerId).all();
      return json(honors.results);
    }

    const honors = await env.DB.prepare(`
      SELECT ph.*, ht.key as honor_key, ht.name as honor_name, ht.type as honor_type,
        COALESCE(p.alias, p.name) as player_name, p.avatar_url
      FROM player_honors ph
      JOIN honor_types ht ON ht.id = ph.honor_type_id
      JOIN players p ON p.id = ph.player_id
      ORDER BY ht.sort_order, ph.season DESC
    `).all();
    return json(honors.results);
  }

  // ── POST /api/honors — tildel manuel hædersbevisning (admin) ─────────────
  if (request.method === 'POST') {
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);
    const body = await request.json() as any;
    const { player_id, honor_type_id, season } = body;
    if (!player_id || !honor_type_id) return json({ error: 'Mangler player_id eller honor_type_id' }, 400);

    // Verificér at det er en manuel type
    const ht = await env.DB.prepare(
      "SELECT type FROM honor_types WHERE id = ?"
    ).bind(honor_type_id).first() as { type: string } | null;
    if (!ht) return json({ error: 'Ukendt honor_type_id' }, 404);
    if (ht.type !== 'manual') return json({ error: 'Kun manuelle hædersbevisninger kan tildeles manuelt' }, 400);
    if (!season) return json({ error: 'Årstal er påkrævet for manuelle hædersbevisninger' }, 400);

    try {
      await env.DB.prepare(
        'INSERT INTO player_honors (id, player_id, honor_type_id, season, awarded_by) VALUES (?,?,?,?,?)'
      ).bind(crypto.randomUUID(), player_id, honor_type_id, Number(season), user.sub).run();
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) return json({ error: 'Hædersbevisningen er allerede tildelt for dette årstal' }, 409);
      throw e;
    }
    return json({ ok: true });
  }

  // ── DELETE /api/honors/:id (admin) ────────────────────────────────────────
  if (request.method === 'DELETE' && honorId) {
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);

    // Kun manuelle kan slettes
    const honor = await env.DB.prepare(`
      SELECT ph.id, ht.type FROM player_honors ph
      JOIN honor_types ht ON ht.id = ph.honor_type_id
      WHERE ph.id = ?
    `).bind(honorId).first() as { id: string; type: string } | null;

    if (!honor) return json({ error: 'Ikke fundet' }, 404);
    if (honor.type !== 'manual') return json({ error: 'Automatiske hædersbevisninger kan ikke slettes' }, 400);

    await env.DB.prepare('DELETE FROM player_honors WHERE id = ?').bind(honorId).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}

// ── Auto-tildeling af hædersbevisninger ──────────────────────────────────────
// Beregn totaler per spiller og tildel manglende auto-hædersbevisninger
export async function autoAssignHonors(env: Env, playerIds: string[]): Promise<void> {
  if (!playerIds.length) return;

  const autoTypes = await env.DB.prepare(
    "SELECT id, threshold_type, threshold_value FROM honor_types WHERE type = 'auto'"
  ).all();

  if (!autoTypes.results.length) return;

  for (const playerId of playerIds) {
    // Beregn totaler: match_stats + player_stats_legacy kombineret
    const modernTotals = await env.DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN ms.played=1 THEN 1 ELSE 0 END), 0) as matches,
        COALESCE(SUM(ms.goals), 0) as goals,
        COALESCE(SUM(ms.mom), 0) as mom,
        COUNT(DISTINCT e.season) as seasons_modern
      FROM match_stats ms
      JOIN events e ON e.id = ms.event_id
      WHERE ms.player_id = ?
    `).bind(playerId).first() as any;

    const legacyTotals = await env.DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN psl.season NOT IN (
          SELECT DISTINCT e2.season FROM match_stats ms2 JOIN events e2 ON e2.id = ms2.event_id WHERE ms2.player_id = ?
        ) THEN psl.matches ELSE 0 END), 0) as matches,
        COALESCE(SUM(CASE WHEN psl.season NOT IN (
          SELECT DISTINCT e2.season FROM match_stats ms2 JOIN events e2 ON e2.id = ms2.event_id WHERE ms2.player_id = ?
        ) THEN psl.goals ELSE 0 END), 0) as goals,
        COALESCE(SUM(CASE WHEN psl.season NOT IN (
          SELECT DISTINCT e2.season FROM match_stats ms2 JOIN events e2 ON e2.id = ms2.event_id WHERE ms2.player_id = ?
        ) THEN psl.mom ELSE 0 END), 0) as mom,
        COUNT(DISTINCT CASE WHEN psl.season NOT IN (
          SELECT DISTINCT e2.season FROM match_stats ms2 JOIN events e2 ON e2.id = ms2.event_id WHERE ms2.player_id = ?
        ) THEN psl.season ELSE NULL END) as seasons_legacy
      FROM player_stats_legacy psl
      WHERE psl.player_id = ?
    `).bind(playerId, playerId, playerId, playerId, playerId).first() as any;

    const totals = {
      matches: (modernTotals?.matches || 0) + (legacyTotals?.matches || 0),
      goals:   (modernTotals?.goals   || 0) + (legacyTotals?.goals   || 0),
      mom:     (modernTotals?.mom     || 0) + (legacyTotals?.mom     || 0),
      seasons: (modernTotals?.seasons_modern || 0) + (legacyTotals?.seasons_legacy || 0),
    };

    for (const ht of autoTypes.results as any[]) {
      let total = 0;
      if (ht.threshold_type === 'matches') total = totals.matches;
      else if (ht.threshold_type === 'goals')   total = totals.goals;
      else if (ht.threshold_type === 'mom')     total = totals.mom;
      else if (ht.threshold_type === 'seasons') total = totals.seasons;

      if (total >= ht.threshold_value) {
        // season = NULL for automatiske hædersbevisninger
        await env.DB.prepare(
          'INSERT OR IGNORE INTO player_honors (id, player_id, honor_type_id, season, awarded_by) VALUES (?,?,?,NULL,NULL)'
        ).bind(crypto.randomUUID(), playerId, ht.id).run();
      }
    }
  }
}
