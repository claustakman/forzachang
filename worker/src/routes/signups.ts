import { json, Env } from '../index';
import { nanoid } from '../lib/auth';
import type { JWTPayload } from '../lib/auth';

export async function handleSignups(request: Request, env: Env, user: JWTPayload): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const matchId = url.searchParams.get('match_id');
    if (!matchId) return json({ error: 'match_id required' }, 400);
    const row = await env.DB.prepare(
      'SELECT * FROM signups WHERE match_id = ? AND player_id = ?'
    ).bind(matchId, user.sub).first();
    return json(row || null);
  }

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
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
