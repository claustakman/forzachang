import { json, Env, syncWebcal } from '../index';
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

  // POST /api/settings/sync — manuel webcal-sync trigger
  if (request.method === 'POST') {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/sync')) {
      const setting = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind('webcal_url').first();
      if (!setting?.value) return json({ error: 'Ingen webcal-URL konfigureret' }, 400);
      await syncWebcal(env);
      return json({ ok: true });
    }

    // POST /api/settings/bulk-deadlines — opdater tilmeldingsfrist på alle kommende kampe
    if (url.pathname.endsWith('/bulk-deadlines')) {
      const body = await request.json() as any;
      const days = Math.min(Math.max(Number(body.days) || 5, 1), 30);
      const now = new Date().toISOString();

      // Opdater alle kommende kampe der har en signup_deadline sat via webcal/auto (dvs. dem der ikke er manuelt sat)
      // Vi opdaterer alle kommende kampe der har start_time i fremtiden
      const res = await env.DB.prepare(`
        UPDATE events
        SET signup_deadline = datetime(start_time, '-' || ? || ' days')
        WHERE type = 'kamp'
          AND status = 'aktiv'
          AND start_time > ?
      `).bind(days, now).run();

      return json({ ok: true, updated: res.meta?.changes ?? 0 });
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}
