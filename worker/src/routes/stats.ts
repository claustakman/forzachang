import { json, Env } from '../index';
import { nanoid } from '../lib/auth';
import type { JWTPayload } from '../lib/auth';

export async function handleStats(request: Request, env: Env, user: JWTPayload): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const season = url.searchParams.get('season');
    const playerId = url.searchParams.get('player_id');

    if (playerId) {
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
      return json(stats.results);
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
    return json(rows.results);
  }

  if (request.method === 'POST' && user.role === 'admin') {
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
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
