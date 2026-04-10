// Fase 12: Kampens Spiller afstemning
import { json, Env } from '../index';

type JWTPayload = { sub: string; role: string };

export async function handleVotes(
  request: Request,
  env: Env,
  payload: JWTPayload,
  sessionId?: string,
  sub?: string
): Promise<Response> {
  const method = request.method;

  // GET /api/votes/sessions/active — aktiv session for en given kamp
  // ?event_id=xxx
  if (!sessionId && method === 'GET') {
    const url = new URL(request.url);
    const eventId = url.searchParams.get('event_id');
    if (!eventId) return json({ error: 'event_id required' }, 400);

    const session = await env.DB.prepare(
      `SELECT vs.id, vs.event_id, vs.closed_at, vs.created_at,
              e.title as event_title, e.start_time
       FROM vote_sessions vs
       JOIN events e ON e.id = vs.event_id
       WHERE vs.event_id = ?`
    ).bind(eventId).first() as any;

    if (!session) return json({ session: null });

    // Antal stemmer
    const voteCount = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM votes WHERE session_id = ?'
    ).bind(session.id).first() as any;

    // Har denne spiller stemt?
    const myVote = await env.DB.prepare(
      'SELECT candidate_id FROM votes WHERE session_id = ? AND voter_id = ?'
    ).bind(session.id, payload.sub).first() as any;

    return json({
      session: {
        ...session,
        vote_count: voteCount?.count ?? 0,
        my_vote: myVote?.candidate_id ?? null,
      }
    });
  }

  // POST /api/votes/sessions — opret ny afstemning (trainer+)
  if (!sessionId && method === 'POST') {
    if (payload.role !== 'trainer' && payload.role !== 'admin') {
      return json({ error: 'Kun trainer/admin kan starte afstemning' }, 403);
    }
    const body = await request.json() as any;
    const { event_id } = body;
    if (!event_id) return json({ error: 'event_id required' }, 400);

    // Tjek at eventet er en kamp
    const event = await env.DB.prepare(
      'SELECT id, type, title, start_time FROM events WHERE id = ?'
    ).bind(event_id).first() as any;
    if (!event) return json({ error: 'Event ikke fundet' }, 404);
    if (event.type !== 'kamp') return json({ error: 'Afstemning kræver type=kamp' }, 400);

    // Tjek ingen aktiv session allerede
    const existing = await env.DB.prepare(
      'SELECT id, closed_at FROM vote_sessions WHERE event_id = ?'
    ).bind(event_id).first() as any;
    if (existing && !existing.closed_at) {
      return json({ error: 'Der er allerede en åben afstemning for denne kamp' }, 409);
    }
    if (existing) {
      // Genåbn ved at slette og oprette ny
      await env.DB.prepare('DELETE FROM vote_sessions WHERE event_id = ?').bind(event_id).run();
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO vote_sessions (id, event_id, created_by) VALUES (?, ?, ?)'
    ).bind(id, event_id, payload.sub).run();

    // Hent tilmeldte spillere (kandidater)
    const signups = await env.DB.prepare(
      `SELECT p.id, COALESCE(p.alias, p.name) as name, p.avatar_url
       FROM event_signups es
       JOIN players p ON p.id = es.player_id
       WHERE es.event_id = ? AND es.status = 'tilmeldt' AND p.id != 'admin'
       ORDER BY name`
    ).bind(event_id).all();

    return json({ session_id: id, candidates: signups.results }, 201);
  }

  // POST /api/votes/sessions/:id/vote — afgiv stemme
  if (sessionId && sub === 'vote' && method === 'POST') {
    const body = await request.json() as any;
    const { candidate_id } = body;
    if (!candidate_id) return json({ error: 'candidate_id required' }, 400);

    const session = await env.DB.prepare(
      'SELECT id, event_id, closed_at FROM vote_sessions WHERE id = ?'
    ).bind(sessionId).first() as any;
    if (!session) return json({ error: 'Afstemning ikke fundet' }, 404);
    if (session.closed_at) return json({ error: 'Afstemningen er lukket' }, 409);

    // Tjek at kandidaten er tilmeldt kampen
    const candidate = await env.DB.prepare(
      `SELECT p.id FROM event_signups es
       JOIN players p ON p.id = es.player_id
       WHERE es.event_id = ? AND es.status = 'tilmeldt' AND p.id = ?`
    ).bind(session.event_id, candidate_id).first();
    if (!candidate) return json({ error: 'Kandidat er ikke tilmeldt kampen' }, 400);

    // Spilleren skal selv være tilmeldt
    const voterSignup = await env.DB.prepare(
      `SELECT id FROM event_signups WHERE event_id = ? AND player_id = ? AND status = 'tilmeldt'`
    ).bind(session.event_id, payload.sub).first();
    if (!voterSignup) return json({ error: 'Du er ikke tilmeldt denne kamp' }, 403);

    // UPSERT stemme (én stemme per spiller per session)
    await env.DB.prepare(
      `INSERT INTO votes (id, session_id, voter_id, candidate_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(session_id, voter_id)
       DO UPDATE SET candidate_id = excluded.candidate_id, created_at = datetime('now')`
    ).bind(crypto.randomUUID(), sessionId, payload.sub, candidate_id).run();

    return json({ ok: true });
  }

  // GET /api/votes/sessions/:id/results — hent resultater (kun trainer/admin, eller lukket session)
  if (sessionId && sub === 'results' && method === 'GET') {
    const session = await env.DB.prepare(
      `SELECT vs.id, vs.event_id, vs.closed_at, vs.created_at,
              e.title as event_title
       FROM vote_sessions vs
       JOIN events e ON e.id = vs.event_id
       WHERE vs.id = ?`
    ).bind(sessionId).first() as any;
    if (!session) return json({ error: 'Afstemning ikke fundet' }, 404);

    // Åbne resultater: kun trainer/admin kan se, mens sessionen er åben
    if (!session.closed_at && payload.role !== 'trainer' && payload.role !== 'admin') {
      return json({ error: 'Resultater er kun tilgængelige når afstemningen er lukket' }, 403);
    }

    const results = await env.DB.prepare(
      `SELECT p.id, COALESCE(p.alias, p.name) as name, p.avatar_url,
              COUNT(v.id) as votes
       FROM event_signups es
       JOIN players p ON p.id = es.player_id
       LEFT JOIN votes v ON v.candidate_id = p.id AND v.session_id = ?
       WHERE es.event_id = ? AND es.status = 'tilmeldt' AND p.id != 'admin'
       GROUP BY p.id
       ORDER BY votes DESC, name`
    ).bind(sessionId, session.event_id).all();

    const totalVotes = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM votes WHERE session_id = ?'
    ).bind(sessionId).first() as any;

    const myVote = await env.DB.prepare(
      'SELECT candidate_id FROM votes WHERE session_id = ? AND voter_id = ?'
    ).bind(sessionId, payload.sub).first() as any;

    return json({
      session,
      results: results.results,
      total_votes: totalVotes?.count ?? 0,
      my_vote: myVote?.candidate_id ?? null,
    });
  }

  // POST /api/votes/sessions/:id/close — luk afstemning (trainer+)
  if (sessionId && sub === 'close' && method === 'POST') {
    if (payload.role !== 'trainer' && payload.role !== 'admin') {
      return json({ error: 'Kun trainer/admin kan lukke afstemning' }, 403);
    }
    const session = await env.DB.prepare(
      'SELECT id, closed_at FROM vote_sessions WHERE id = ?'
    ).bind(sessionId).first() as any;
    if (!session) return json({ error: 'Afstemning ikke fundet' }, 404);
    if (session.closed_at) return json({ error: 'Afstemningen er allerede lukket' }, 409);

    await env.DB.prepare(
      `UPDATE vote_sessions SET closed_at = datetime('now') WHERE id = ?`
    ).bind(sessionId).run();

    return json({ ok: true });
  }

  return json({ error: 'Not found' }, 404);
}
