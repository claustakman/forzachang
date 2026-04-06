import { json, Env } from '../index';
import type { JWTPayload } from '../lib/auth';

export async function handlePushSubscriptions(
  request: Request,
  env: Env,
  user: JWTPayload
): Promise<Response> {
  if (request.method === 'POST') {
    const body = await request.json() as {
      endpoint: string;
      keys?: { p256dh: string; auth: string };
      // PushSubscription.toJSON() format
      p256dh?: string;
      auth?: string;
    };

    const endpoint = body.endpoint;
    const p256dh = body.keys?.p256dh || (body as any).p256dh;
    const auth = body.keys?.auth || (body as any).auth;

    if (!endpoint || !p256dh || !auth) {
      return json({ error: 'Manglende felter: endpoint, p256dh, auth' }, 400);
    }

    await env.DB.prepare(`
      INSERT INTO push_subscriptions (id, player_id, endpoint, p256dh, auth, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        player_id = excluded.player_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent
    `).bind(
      crypto.randomUUID(),
      user.sub,
      endpoint,
      p256dh,
      auth,
      request.headers.get('User-Agent') || null
    ).run();

    return json({ ok: true });
  }

  if (request.method === 'DELETE') {
    const body = await request.json() as { endpoint: string };
    if (!body.endpoint) return json({ error: 'Manglende endpoint' }, 400);

    await env.DB.prepare(
      'DELETE FROM push_subscriptions WHERE endpoint=? AND player_id=?'
    ).bind(body.endpoint, user.sub).run();

    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
