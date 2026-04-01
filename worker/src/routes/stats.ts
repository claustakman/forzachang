import { json, Env } from '../index';
import type { JWTPayload } from '../lib/auth';

function nanoid() { return crypto.randomUUID(); }

export async function handleStats(request: Request, env: Env, user: JWTPayload): Promise<Response> {
  const url = new URL(request.url);
  const isTrainer = user.role === 'trainer' || user.role === 'admin';

  // ── GET /api/stats?season=&player_id= ────────────────────────────────────
  if (request.method === 'GET') {
    const season = url.searchParams.get('season');
    const playerId = url.searchParams.get('player_id');

    // Spillerprofil: alle sæsoner for én spiller (legacy + match_stats kombineret)
    if (playerId) {
      const legacy = await env.DB.prepare(`
        SELECT season,
          matches, goals, mom, yellow_cards, red_cards, fines_amount
        FROM player_stats_legacy
        WHERE player_id = ?
        ORDER BY season DESC
      `).bind(playerId).all();

      const modern = await env.DB.prepare(`
        SELECT e.season,
          COUNT(*) as matches,
          COALESCE(SUM(ms.goals), 0) as goals,
          COALESCE(SUM(ms.mom), 0) as mom,
          COALESCE(SUM(ms.yellow_cards), 0) as yellow_cards,
          COALESCE(SUM(ms.red_cards), 0) as red_cards,
          0 as fines_amount
        FROM match_stats ms
        JOIN events e ON e.id = ms.event_id
        WHERE ms.player_id = ? AND ms.played = 1
        GROUP BY e.season
        ORDER BY e.season DESC
      `).bind(playerId).all();

      // Merge: modern stats vinder over legacy for samme sæson
      const modernSeasons = new Set((modern.results as any[]).map(r => r.season));
      const legacyFiltered = (legacy.results as any[]).filter(r => !modernSeasons.has(r.season));
      const combined = [...(modern.results as any[]), ...legacyFiltered]
        .sort((a, b) => b.season - a.season);

      return json(combined);
    }

    // Samlet rangordning: legacy + match_stats kombineret per spiller
    // Bruges til leaderboards og sæsonoversigt
    const seasonFilter = season ? `AND e.season = ${Number(season)}` : '';
    const legacySeasonFilter = season ? `AND psl.season = ${Number(season)}` : '';

    const modernRows = await env.DB.prepare(`
      SELECT
        p.id,
        COALESCE(p.alias, p.name) as name,
        p.active,
        e.season,
        COALESCE(SUM(CASE WHEN ms.played=1 THEN 1 ELSE 0 END), 0) as matches,
        COALESCE(SUM(ms.goals), 0) as goals,
        COALESCE(SUM(ms.mom), 0) as mom,
        COALESCE(SUM(ms.yellow_cards), 0) as yellow_cards,
        COALESCE(SUM(ms.red_cards), 0) as red_cards
      FROM players p
      JOIN match_stats ms ON ms.player_id = p.id
      JOIN events e ON e.id = ms.event_id
      WHERE 1=1 ${seasonFilter}
      GROUP BY p.id, e.season
    `).all();

    const legacyRows = await env.DB.prepare(`
      SELECT
        p.id,
        COALESCE(p.alias, p.name) as name,
        p.active,
        psl.season,
        psl.matches,
        psl.goals,
        psl.mom,
        psl.yellow_cards,
        psl.red_cards,
        psl.fines_amount
      FROM player_stats_legacy psl
      JOIN players p ON p.id = psl.player_id
      WHERE 1=1 ${legacySeasonFilter}
    `).all();

    // Aggreger per spiller (summer alle sæsoner hvis ingen sæsonfilter)
    type Row = { id: string; name: string; active: number; season?: number; matches: number; goals: number; mom: number; yellow_cards: number; red_cards: number };
    const map = new Map<string, Row>();

    // Moderne sæsoner der er dækket af match_stats
    const modernSeasonsByPlayer = new Map<string, Set<number>>();
    for (const r of modernRows.results as any[]) {
      if (!modernSeasonsByPlayer.has(r.id)) modernSeasonsByPlayer.set(r.id, new Set());
      modernSeasonsByPlayer.get(r.id)!.add(r.season);
      const key = season ? r.id : r.id;
      const ex = map.get(r.id);
      if (ex) {
        ex.matches += r.matches; ex.goals += r.goals; ex.mom += r.mom;
        ex.yellow_cards += r.yellow_cards; ex.red_cards += r.red_cards;
      } else {
        map.set(r.id, { id: r.id, name: r.name, active: r.active, matches: r.matches, goals: r.goals, mom: r.mom, yellow_cards: r.yellow_cards, red_cards: r.red_cards });
      }
    }

    // Legacy — kun for sæsoner der ikke er dækket af match_stats for denne spiller
    for (const r of legacyRows.results as any[]) {
      const coveredSeasons = modernSeasonsByPlayer.get(r.id);
      if (coveredSeasons?.has(r.season)) continue; // moderne data vinder
      const ex = map.get(r.id);
      if (ex) {
        ex.matches += r.matches; ex.goals += r.goals; ex.mom += r.mom;
        ex.yellow_cards += r.yellow_cards; ex.red_cards += r.red_cards;
      } else {
        map.set(r.id, { id: r.id, name: r.name, active: r.active, matches: r.matches, goals: r.goals, mom: r.mom, yellow_cards: r.yellow_cards, red_cards: r.red_cards });
      }
    }

    const results = Array.from(map.values())
      .filter(r => r.matches > 0)
      .sort((a, b) => b.goals - a.goals || b.matches - a.matches);

    return json(results);
  }

  // ── GET /api/events/:id/stats (håndteres via events route, stub her) ─────
  // ── POST /api/stats — gem kampstatistik for et event (trainer+) ──────────
  if (request.method === 'POST') {
    if (!isTrainer) return json({ error: 'Forbidden' }, 403);

    const body = await request.json() as any;

    // Bulk-gem: { event_id, rows: [{player_id, goals, yellow_cards, red_cards, mom, played}] }
    if (body.event_id && Array.isArray(body.rows)) {
      for (const row of body.rows) {
        const { player_id, goals = 0, yellow_cards = 0, red_cards = 0, mom = 0, played = 1 } = row;
        const existing = await env.DB.prepare(
          'SELECT id FROM match_stats WHERE event_id=? AND player_id=?'
        ).bind(body.event_id, player_id).first();
        if (existing) {
          await env.DB.prepare(
            'UPDATE match_stats SET goals=?,yellow_cards=?,red_cards=?,mom=?,played=? WHERE event_id=? AND player_id=?'
          ).bind(goals, yellow_cards, red_cards, mom ? 1 : 0, played, body.event_id, player_id).run();
        } else {
          await env.DB.prepare(
            'INSERT INTO match_stats (id,event_id,player_id,goals,yellow_cards,red_cards,mom,played) VALUES(?,?,?,?,?,?,?,?)'
          ).bind(nanoid(), body.event_id, player_id, goals, yellow_cards, red_cards, mom ? 1 : 0, played).run();
        }
      }
      return json({ ok: true });
    }

    // Legacy single-row (bagudkompatibel med gammel Admin.tsx)
    const { match_id, player_id, goals, yellow_cards, red_cards, played } = body;
    if (match_id && player_id) {
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
      return json({ ok: true });
    }

    return json({ error: 'Ugyldigt request-format' }, 400);
  }

  return json({ error: 'Method not allowed' }, 405);
}

// ── GET /api/events/:id/stats ──────────────────────────────────────────────
// Returnerer eksisterende stats for event + liste over tilmeldte spillere
export async function handleEventStats(request: Request, env: Env, user: JWTPayload, eventId: string): Promise<Response> {
  const isTrainer = user.role === 'trainer' || user.role === 'admin';
  if (!isTrainer) return json({ error: 'Forbidden' }, 403);

  const event = await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(eventId).first();
  if (!event) return json({ error: 'Ikke fundet' }, 404);

  // Tilmeldte spillere
  const signups = await env.DB.prepare(`
    SELECT p.id, COALESCE(p.alias, p.name) as name, p.avatar_url, es.status
    FROM event_signups es
    JOIN players p ON p.id = es.player_id
    WHERE es.event_id = ?
    ORDER BY es.status, name
  `).bind(eventId).all();

  // Eksisterende stats
  const existing = await env.DB.prepare(
    'SELECT * FROM match_stats WHERE event_id=?'
  ).bind(eventId).all();

  return json({ event, signups: signups.results, stats: existing.results });
}
