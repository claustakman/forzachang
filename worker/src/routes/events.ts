import { json, Env, sendManualReminders } from '../index';
import type { JWTPayload } from '../lib/auth';

function nanoid() {
  return crypto.randomUUID();
}

export async function handleEvents(request: Request, env: Env, user: JWTPayload): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/'); // ['', 'api', 'events', id?, sub?]
  const id = pathParts[3];
  const sub = pathParts[4]; // 'signup' | 'organizers'

  const isTrainer = user.role === 'trainer' || user.role === 'admin';

  // ── POST /api/events/:id/signup ──────────────────────────────────────────
  if (request.method === 'POST' && id && sub === 'signup') {
    const { status, message, player_id: targetPlayerId } = await request.json() as any;
    if (status !== 'tilmeldt' && status !== 'afmeldt') {
      return json({ error: 'Ugyldig status' }, 400);
    }

    // Trainer/admin kan tilmelde på vegne af andre spillere
    const playerId = (isTrainer && targetPlayerId) ? targetPlayerId : user.sub;

    const existing = await env.DB.prepare(
      'SELECT id FROM event_signups WHERE event_id=? AND player_id=?'
    ).bind(id, playerId).first();

    if (existing) {
      await env.DB.prepare(
        'UPDATE event_signups SET status=?, message=?, created_at=datetime("now") WHERE event_id=? AND player_id=?'
      ).bind(status, message || null, id, playerId).run();
    } else {
      await env.DB.prepare(
        'INSERT INTO event_signups (id, event_id, player_id, status, message) VALUES (?,?,?,?,?)'
      ).bind(nanoid(), id, playerId, status, message || null).run();
    }
    return json({ ok: true });
  }

  // ── DELETE /api/events/:id/signup — slet tilmelding (annuller) ───────────
  if (request.method === 'DELETE' && id && sub === 'signup') {
    const url2 = new URL(request.url);
    const targetPlayerId = url2.searchParams.get('player_id');
    const playerId = (isTrainer && targetPlayerId) ? targetPlayerId : user.sub;
    await env.DB.prepare(
      'DELETE FROM event_signups WHERE event_id=? AND player_id=?'
    ).bind(id, playerId).run();
    return json({ ok: true });
  }

  // ── POST /api/events/:id/guests — tilføj gæst ───────────────────────────
  if (request.method === 'POST' && id && sub === 'guests') {
    if (!isTrainer) return json({ error: 'Forbidden' }, 403);
    const { name } = await request.json() as any;
    if (!name?.trim()) return json({ error: 'Navn er påkrævet' }, 400);
    await env.DB.prepare(
      'INSERT INTO event_guests (id, event_id, name, added_by) VALUES (?,?,?,?)'
    ).bind(nanoid(), id, name.trim(), user.sub).run();
    return json({ ok: true });
  }

  // ── DELETE /api/events/:id/guests/:guestId ───────────────────────────────
  if (request.method === 'DELETE' && id && sub === 'guests') {
    if (!isTrainer) return json({ error: 'Forbidden' }, 403);
    const guestId = pathParts[5];
    if (!guestId) return json({ error: 'Mangler gæst-id' }, 400);
    await env.DB.prepare('DELETE FROM event_guests WHERE id=? AND event_id=?').bind(guestId, id).run();
    return json({ ok: true });
  }

  // ── POST /api/events/:id/remind — send manuelle påmindelser ─────────────
  if (request.method === 'POST' && id && sub === 'remind') {
    if (!isTrainer) return json({ error: 'Forbidden' }, 403);
    const { player_ids } = await request.json() as { player_ids: string[] };
    if (!Array.isArray(player_ids) || player_ids.length === 0) {
      return json({ error: 'Mangler player_ids' }, 400);
    }
    const sent = await sendManualReminders(env, id, player_ids);
    return json({ ok: true, sent });
  }

  // ── GET /api/events/:id ──────────────────────────────────────────────────
  if (request.method === 'GET' && id && !sub) {
    const event = await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(id).first();
    if (!event) return json({ error: 'Ikke fundet' }, 404);

    const signups = await env.DB.prepare(`
      SELECT es.player_id, es.status, es.message, es.created_at, COALESCE(p.alias, p.name) as name, p.avatar_url
      FROM event_signups es
      JOIN players p ON p.id = es.player_id
      WHERE es.event_id = ? AND p.role != 'admin'
      ORDER BY es.created_at
    `).bind(id).all();

    const organizers = await env.DB.prepare(`
      SELECT eo.player_id, COALESCE(p.alias, p.name) as name
      FROM event_organizers eo
      JOIN players p ON p.id = eo.player_id
      WHERE eo.event_id = ?
    `).bind(id).all();

    const guests = await env.DB.prepare(`
      SELECT id, name, added_by FROM event_guests WHERE event_id = ? ORDER BY created_at
    `).bind(id).all();

    const commentCount = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM event_comments WHERE event_id=? AND deleted=0'
    ).bind(id).first<{ count: number }>();

    return json({
      ...event,
      signups: signups.results,
      organizers: organizers.results,
      guests: guests.results,
      comment_count: commentCount?.count ?? 0,
    });
  }

  // ── GET /api/events ──────────────────────────────────────────────────────
  if (request.method === 'GET') {
    const tab = url.searchParams.get('tab') || 'kommende'; // 'kommende' | 'historik'
    const type = url.searchParams.get('type') || '';
    const season = url.searchParams.get('season') || '';
    const q = url.searchParams.get('q') || '';

    // cutoff: nu minus 2 dage
    const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const conditions: string[] = [];
    const binds: (string | number)[] = [];

    if (tab === 'kommende') {
      conditions.push('e.start_time >= ?');
      binds.push(cutoff);
    } else {
      conditions.push('e.start_time < ?');
      binds.push(cutoff);
    }

    if (type) { conditions.push('e.type = ?'); binds.push(type); }
    if (season) { conditions.push('e.season = ?'); binds.push(Number(season)); }
    if (q) { conditions.push('e.title LIKE ?'); binds.push(`%${q}%`); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const order = tab === 'kommende' ? 'ASC' : 'DESC';

    const events = await env.DB.prepare(`
      SELECT e.*,
        (SELECT COUNT(*) FROM event_signups es JOIN players p ON p.id = es.player_id WHERE es.event_id = e.id AND es.status = 'tilmeldt' AND p.role != 'admin')
        + (SELECT COUNT(*) FROM event_guests eg WHERE eg.event_id = e.id) AS signup_count,
        (SELECT es2.status FROM event_signups es2 WHERE es2.event_id = e.id AND es2.player_id = ?) AS my_status,
        (SELECT COUNT(*) FROM event_comments ec
          WHERE ec.event_id = e.id AND ec.deleted = 0
          AND ec.created_at > COALESCE(
            (SELECT last_read_at FROM comment_reads WHERE player_id = ? AND event_id = e.id),
            '1970-01-01'
          )
        ) AS unread_comments
      FROM events e
      ${where}
      ORDER BY e.start_time ${order}
    `).bind(user.sub, user.sub, ...binds).all();

    return json(events.results);
  }

  // ── POST /api/events ─────────────────────────────────────────────────────
  if (request.method === 'POST' && !id) {
    if (!isTrainer) return json({ error: 'Forbidden' }, 403);

    const body = await request.json() as any;
    const { type, title, description, location, start_time, end_time, meeting_time,
            signup_deadline, season, organizer_ids } = body;

    if (!title || !start_time || !season) {
      return json({ error: 'Mangler påkrævede felter: title, start_time, season' }, 400);
    }

    const newId = nanoid();
    await env.DB.prepare(`
      INSERT INTO events (id, type, title, description, location, start_time, end_time,
        meeting_time, signup_deadline, season, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).bind(newId, type || 'kamp', title, description || null, location || null,
      start_time, end_time || null, meeting_time || null,
      signup_deadline || null, Number(season), user.sub).run();

    if (Array.isArray(organizer_ids) && organizer_ids.length > 0) {
      for (const pid of organizer_ids) {
        await env.DB.prepare(
          'INSERT OR IGNORE INTO event_organizers (event_id, player_id) VALUES (?,?)'
        ).bind(newId, pid).run();
      }
    }

    return json({ ok: true, id: newId }, 201);
  }

  // ── PUT /api/events/:id ──────────────────────────────────────────────────
  if (request.method === 'PUT' && id) {
    // Tjek om brugeren er admin/træner ELLER arrangør på eventet
    if (!isTrainer) {
      const isOrganizer = await env.DB.prepare(
        'SELECT 1 FROM event_organizers WHERE event_id=? AND player_id=?'
      ).bind(id, user.sub).first();
      if (!isOrganizer) return json({ error: 'Forbidden' }, 403);
    }

    const body = await request.json() as any;
    const fields = ['type', 'title', 'description', 'location', 'start_time', 'end_time',
                    'meeting_time', 'signup_deadline', 'season', 'status', 'result'];

    for (const f of fields) {
      if (body[f] !== undefined) {
        const val = f === 'season' ? Number(body[f]) : (body[f] || null);
        await env.DB.prepare(`UPDATE events SET ${f}=? WHERE id=?`).bind(val, id).run();
      }
    }

    // Opdater arrangører hvis sendt med
    if (Array.isArray(body.organizer_ids)) {
      await env.DB.prepare('DELETE FROM event_organizers WHERE event_id=?').bind(id).run();
      for (const pid of body.organizer_ids) {
        await env.DB.prepare(
          'INSERT OR IGNORE INTO event_organizers (event_id, player_id) VALUES (?,?)'
        ).bind(id, pid).run();
      }
    }

    return json({ ok: true });
  }

  // ── DELETE /api/events/:id ───────────────────────────────────────────────
  if (request.method === 'DELETE' && id) {
    if (!isTrainer) return json({ error: 'Forbidden' }, 403);
    await env.DB.prepare('DELETE FROM events WHERE id=?').bind(id).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
