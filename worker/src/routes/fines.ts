import { json, Env } from '../index';
import type { JWTPayload } from '../lib/auth';

function nanoid() { return crypto.randomUUID(); }

export async function handleFines(request: Request, env: Env, user: JWTPayload): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname; // e.g. /api/fines, /api/fines/123, /api/fines/summary

  const isTrainer = user.role === 'trainer' || user.role === 'admin';

  // ── GET /api/fines/summary ────────────────────────────────────────────────
  if (request.method === 'GET' && path === '/api/fines/summary') {
    const rows = await env.DB.prepare(`
      SELECT
        p.id as player_id,
        p.name,
        p.alias,
        p.avatar_url,
        p.active,
        COALESCE(SUM(f.amount), 0) as total_fines,
        COALESCE((
          SELECT SUM(fp.amount) FROM fine_payments fp WHERE fp.player_id = p.id
        ), 0) as total_payments
      FROM players p
      LEFT JOIN fines f ON f.player_id = p.id
      WHERE p.active = 1
      GROUP BY p.id
      ORDER BY (COALESCE(SUM(f.amount), 0) - COALESCE((
        SELECT SUM(fp2.amount) FROM fine_payments fp2 WHERE fp2.player_id = p.id
      ), 0)) DESC, p.name
    `).all();

    const result = (rows.results as any[]).map(r => ({
      ...r,
      name: r.alias?.trim() || r.name.split(' ')[0],
      full_name: r.name,
      balance: r.total_fines - r.total_payments,
    }));
    return json(result);
  }

  // ── GET /api/fines ────────────────────────────────────────────────────────
  if (request.method === 'GET' && path === '/api/fines') {
    const playerId = url.searchParams.get('player_id');
    const whereClause = playerId ? 'WHERE f.player_id = ?' : '';
    const bindings: string[] = playerId ? [playerId] : [];

    const fines = await env.DB.prepare(`
      SELECT
        f.id, f.player_id, f.fine_type_id, f.event_id, f.amount, f.note,
        f.assigned_by, f.created_at,
        COALESCE(p.alias, p.name) as player_name,
        p.name as player_full_name,
        p.avatar_url as player_avatar_url,
        ft.name as fine_type_name,
        e.title as event_title
      FROM fines f
      JOIN players p ON p.id = f.player_id
      JOIN fine_types ft ON ft.id = f.fine_type_id
      LEFT JOIN events e ON e.id = f.event_id
      ${whereClause}
      ORDER BY f.created_at DESC
    `).bind(...bindings).all();

    return json(fines.results);
  }

  // ── POST /api/fines ───────────────────────────────────────────────────────
  if (request.method === 'POST' && path === '/api/fines') {
    if (!isTrainer) return json({ error: 'Forbidden' }, 403);
    const { player_id, fine_type_id, event_id, note } = await request.json() as any;
    if (!player_id || !fine_type_id) return json({ error: 'player_id og fine_type_id kræves' }, 400);

    const fineType = await env.DB.prepare('SELECT * FROM fine_types WHERE id=?').bind(fine_type_id).first();
    if (!fineType) return json({ error: 'Ukendt bødetype' }, 400);

    const id = nanoid();
    await env.DB.prepare(
      'INSERT OR IGNORE INTO fines (id, player_id, fine_type_id, event_id, amount, note, assigned_by) VALUES (?,?,?,?,?,?,?)'
    ).bind(id, player_id, fine_type_id, event_id || null, fineType.amount, note || null, user.sub).run();

    const fine = await env.DB.prepare(`
      SELECT f.*, COALESCE(p.alias, p.name) as player_name, p.avatar_url as player_avatar_url,
        ft.name as fine_type_name, e.title as event_title
      FROM fines f
      JOIN players p ON p.id = f.player_id
      JOIN fine_types ft ON ft.id = f.fine_type_id
      LEFT JOIN events e ON e.id = f.event_id
      WHERE f.id = ?
    `).bind(id).first();

    return json(fine, 201);
  }

  // ── DELETE /api/fines/:id ─────────────────────────────────────────────────
  const fineMatch = path.match(/^\/api\/fines\/([^/]+)$/);
  if (request.method === 'DELETE' && fineMatch) {
    if (!isTrainer) return json({ error: 'Forbidden' }, 403);
    const id = fineMatch[1];
    await env.DB.prepare('DELETE FROM fines WHERE id=?').bind(id).run();
    return json({ ok: true });
  }

  return json({ error: 'Not found' }, 404);
}

// ── Fine types ────────────────────────────────────────────────────────────────

export async function handleFineTypes(request: Request, env: Env, user: JWTPayload): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const isAdmin = user.role === 'admin';

  // GET /api/fine-types — alle aktive (player+)
  if (request.method === 'GET') {
    const types = await env.DB.prepare(
      'SELECT * FROM fine_types ORDER BY sort_order, name'
    ).all();
    return json(types.results);
  }

  // POST /api/fine-types — opret (admin)
  if (request.method === 'POST') {
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);
    const { name, amount, auto_assign, sort_order = 0 } = await request.json() as any;
    if (!name || amount == null) return json({ error: 'name og amount kræves' }, 400);
    const id = nanoid();
    await env.DB.prepare(
      'INSERT INTO fine_types (id, name, amount, auto_assign, sort_order) VALUES (?,?,?,?,?)'
    ).bind(id, name, amount, auto_assign || null, sort_order).run();
    const row = await env.DB.prepare('SELECT * FROM fine_types WHERE id=?').bind(id).first();
    return json(row, 201);
  }

  // PUT /api/fine-types/:id — rediger (admin)
  const idMatch = path.match(/^\/api\/fine-types\/([^/]+)$/);
  if (request.method === 'PUT' && idMatch) {
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);
    const id = idMatch[1];
    const { name, amount, auto_assign, sort_order, active } = await request.json() as any;
    // Build dynamic update to avoid overwriting auto_assign with undefined
    const updates: string[] = [];
    const binds: (string | number | null)[] = [];
    if (name !== undefined)       { updates.push('name=?');       binds.push(name); }
    if (amount !== undefined)     { updates.push('amount=?');     binds.push(amount); }
    if (auto_assign !== undefined){ updates.push('auto_assign=?');binds.push(auto_assign || null); }
    if (sort_order !== undefined) { updates.push('sort_order=?'); binds.push(sort_order); }
    if (active !== undefined)     { updates.push('active=?');     binds.push(active); }
    if (updates.length === 0) return json({ error: 'Ingen felter at opdatere' }, 400);
    binds.push(id);
    await env.DB.prepare(`UPDATE fine_types SET ${updates.join(', ')} WHERE id=?`).bind(...binds).run();
    const row = await env.DB.prepare('SELECT * FROM fine_types WHERE id=?').bind(id).first();
    return json(row);
  }

  // DELETE /api/fine-types/:id — arkivér (admin)
  if (request.method === 'DELETE' && idMatch) {
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);
    const id = idMatch![1];
    await env.DB.prepare('UPDATE fine_types SET active=0 WHERE id=?').bind(id).run();
    return json({ ok: true });
  }

  return json({ error: 'Not found' }, 404);
}

// ── Fine payments ─────────────────────────────────────────────────────────────

export async function handleFinePayments(request: Request, env: Env, user: JWTPayload): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const isTrainer = user.role === 'trainer' || user.role === 'admin';

  // GET /api/fine-payments
  if (request.method === 'GET') {
    const playerId = url.searchParams.get('player_id');
    const whereClause = playerId ? 'WHERE fp.player_id = ?' : '';
    const bindings: string[] = playerId ? [playerId] : [];

    const payments = await env.DB.prepare(`
      SELECT fp.*, COALESCE(p.alias, p.name) as player_name, p.avatar_url as player_avatar_url
      FROM fine_payments fp
      JOIN players p ON p.id = fp.player_id
      ${whereClause}
      ORDER BY fp.created_at DESC
    `).bind(...bindings).all();

    return json(payments.results);
  }

  // POST /api/fine-payments
  if (request.method === 'POST') {
    if (!isTrainer) return json({ error: 'Forbidden' }, 403);
    const { player_id, amount, note } = await request.json() as any;
    if (!player_id || !amount) return json({ error: 'player_id og amount kræves' }, 400);

    const id = nanoid();
    await env.DB.prepare(
      'INSERT INTO fine_payments (id, player_id, amount, note, registered_by) VALUES (?,?,?,?,?)'
    ).bind(id, player_id, amount, note || null, user.sub).run();

    const payment = await env.DB.prepare(`
      SELECT fp.*, COALESCE(p.alias, p.name) as player_name
      FROM fine_payments fp
      JOIN players p ON p.id = fp.player_id
      WHERE fp.id = ?
    `).bind(id).first();

    return json(payment, 201);
  }

  // DELETE /api/fine-payments/:id
  const idMatch = path.match(/^\/api\/fine-payments\/([^/]+)$/);
  if (request.method === 'DELETE' && idMatch) {
    if (!isTrainer) return json({ error: 'Forbidden' }, 403);
    const id = idMatch[1];
    await env.DB.prepare('DELETE FROM fine_payments WHERE id=?').bind(id).run();
    return json({ ok: true });
  }

  return json({ error: 'Not found' }, 404);
}
