import { json, Env } from '../index';
import type { JWTPayload } from '../lib/auth';

function nanoid() {
  return crypto.randomUUID();
}

export async function handleComments(
  request: Request,
  env: Env,
  user: JWTPayload,
  eventId: string,
  commentId?: string
): Promise<Response> {
  // ── POST /api/events/:id/comments/read ──────────────────────────────────
  if (request.method === 'POST' && commentId === 'read') {
    await env.DB.prepare(`
      INSERT INTO comment_reads (player_id, event_id, last_read_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(player_id, event_id) DO UPDATE SET last_read_at = datetime('now')
    `).bind(user.sub, eventId).run();
    return json({ ok: true });
  }

  // ── GET /api/events/:id/comments ────────────────────────────────────────
  if (request.method === 'GET' && !commentId) {
    const comments = await env.DB.prepare(`
      SELECT
        c.id, c.event_id, c.player_id, c.body, c.edited_at, c.deleted, c.created_at,
        COALESCE(p.alias, p.name) as author_name,
        p.avatar_url as author_avatar_url
      FROM event_comments c
      JOIN players p ON p.id = c.player_id
      WHERE c.event_id = ?
      ORDER BY c.created_at ASC
    `).bind(eventId).all();
    return json(comments.results);
  }

  // ── POST /api/events/:id/comments ───────────────────────────────────────
  if (request.method === 'POST' && !commentId) {
    const { body } = await request.json() as { body: string };
    if (!body?.trim()) return json({ error: 'Kommentar må ikke være tom' }, 400);

    const id = nanoid();
    const comment = await env.DB.prepare(`
      INSERT INTO event_comments (id, event_id, player_id, body)
      VALUES (?, ?, ?, ?)
      RETURNING id, event_id, player_id, body, edited_at, deleted, created_at
    `).bind(id, eventId, user.sub, body.trim()).first();

    const player = await env.DB.prepare(
      'SELECT COALESCE(alias, name) as author_name, avatar_url as author_avatar_url FROM players WHERE id=?'
    ).bind(user.sub).first();

    return json({ ...comment, ...player }, 201);
  }

  // ── PUT /api/events/:id/comments/:cid ───────────────────────────────────
  if (request.method === 'PUT' && commentId) {
    const existing = await env.DB.prepare(
      'SELECT player_id FROM event_comments WHERE id=? AND event_id=?'
    ).bind(commentId, eventId).first();
    if (!existing) return json({ error: 'Ikke fundet' }, 404);
    if ((existing as any).player_id !== user.sub) return json({ error: 'Forbidden' }, 403);

    const { body } = await request.json() as { body: string };
    if (!body?.trim()) return json({ error: 'Kommentar må ikke være tom' }, 400);

    await env.DB.prepare(
      "UPDATE event_comments SET body=?, edited_at=datetime('now') WHERE id=?"
    ).bind(body.trim(), commentId).run();
    return json({ ok: true });
  }

  // ── DELETE /api/events/:id/comments/:cid (soft delete) ──────────────────
  if (request.method === 'DELETE' && commentId) {
    const existing = await env.DB.prepare(
      'SELECT player_id FROM event_comments WHERE id=? AND event_id=?'
    ).bind(commentId, eventId).first();
    if (!existing) return json({ error: 'Ikke fundet' }, 404);
    if ((existing as any).player_id !== user.sub) return json({ error: 'Forbidden' }, 403);

    await env.DB.prepare(
      'UPDATE event_comments SET deleted=1 WHERE id=?'
    ).bind(commentId).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
