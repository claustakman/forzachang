import { json, Env } from '../index';
import type { JWTPayload } from '../lib/auth';

export async function handleSettings(request: Request, env: Env, user: JWTPayload): Promise<Response> {
  if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  if (request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT key, value FROM app_settings').all();
    const settings: Record<string, string> = {};
    for (const row of rows.results) {
      settings[row.key as string] = row.value as string;
    }
    return json(settings);
  }

  if (request.method === 'PUT') {
    const body = await request.json() as Record<string, string>;
    for (const [key, value] of Object.entries(body)) {
      await env.DB.prepare(
        'INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,datetime("now")) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at'
      ).bind(key, value).run();
    }
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
