import { json, Env } from '../index';
import { nanoid } from '../lib/auth';
import type { JWTPayload } from '../lib/auth';

export async function handleFines(request: Request, env: Env, user: JWTPayload): Promise<Response> {
  const url = new URL(request.url);
  const id = url.pathname.split('/')[3];

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
    return json({ fines: fines.results, types: types.results, totals: totals.results });
  }

  if (request.method === 'POST' && (user.role === 'admin' || user.role === 'trainer')) {
    const { player_id, fine_type_id, reason } = await request.json() as any;
    const fineType = await env.DB.prepare('SELECT amount FROM fine_types WHERE id=?').bind(fine_type_id).first();
    if (!fineType) return json({ error: 'Ukendt bødetype' }, 400);
    await env.DB.prepare(
      'INSERT INTO fines (id,player_id,fine_type_id,amount,reason,issued_by) VALUES(?,?,?,?,?,?)'
    ).bind(nanoid(), player_id, fine_type_id, fineType.amount, reason || '', user.sub).run();
    return json({ ok: true }, 201);
  }

  if (request.method === 'PUT' && id && (user.role === 'admin' || user.role === 'trainer')) {
    await env.DB.prepare('UPDATE fines SET paid=1 WHERE id=?').bind(id).run();
    return json({ ok: true });
  }

  if (request.method === 'DELETE' && id && user.role === 'admin') {
    await env.DB.prepare('DELETE FROM fines WHERE id=?').bind(id).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
