// Fase 12: Kampens Spiller afstemning — ny version med timer + setup-fase
import { json, Env } from '../index';
import { sendPushToPlayer } from '../lib/sendPush';

type JWTPayload = { sub: string; role: string };

async function getPlayerObjects(env: Env, ids: string[]) {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const res = await env.DB.prepare(
    `SELECT id, COALESCE(alias, name) as name, avatar_url, shirt_number
     FROM players WHERE id IN (${placeholders})`
  ).bind(...ids).all();
  const map = new Map((res.results as any[]).map(p => [p.id, p]));
  return ids.map(id => map.get(id)).filter(Boolean);
}

export async function handleVotes(
  request: Request,
  env: Env,
  payload: JWTPayload,
  sessionId?: string,
  sub?: string
): Promise<Response> {
  const method = request.method;

  // ── GET /api/votes/sessions/active ─────────────────────────────────────────
  if (!sessionId && method === 'GET') {
    // Auto-luk overskredet session
    await env.DB.prepare(
      `UPDATE vote_sessions SET status='closed' WHERE status='active' AND ends_at <= datetime('now')`
    ).run().catch(() => {});

    const session = await env.DB.prepare(
      `SELECT vs.id, vs.event_id, vs.started_by, vs.started_at, vs.ends_at, vs.status,
              vs.candidates, vs.voters, vs.created_at,
              e.title as event_title, e.start_time,
              COALESCE(p.alias, p.name) as started_by_name
       FROM vote_sessions vs
       JOIN events e ON e.id = vs.event_id
       JOIN players p ON p.id = vs.started_by
       WHERE vs.status IN ('active', 'closed')
       ORDER BY vs.created_at DESC LIMIT 1`
    ).first() as any;

    if (!session) return json({ session: null });

    const candidateIds: string[] = JSON.parse(session.candidates || '[]');
    const voterIds: string[] = JSON.parse(session.voters || '[]');
    const candidates = await getPlayerObjects(env, candidateIds);
    const voters = await getPlayerObjects(env, voterIds);

    const voteCount = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM votes WHERE session_id=?'
    ).bind(session.id).first() as any;

    const myVote = await env.DB.prepare(
      'SELECT candidate_id FROM votes WHERE session_id=? AND voter_id=?'
    ).bind(session.id, payload.sub).first() as any;

    return json({
      session: {
        ...session,
        candidates,
        voters,
        vote_count: voteCount?.count ?? 0,
        my_vote: myVote?.candidate_id ?? null,
      }
    });
  }

  // ── POST /api/votes/sessions ────────────────────────────────────────────────
  // Body: { event_id, candidate_ids, voter_ids }
  if (!sessionId && method === 'POST') {
    const body = await request.json() as any;
    const { event_id, candidate_ids, voter_ids, duration_seconds } = body;

    if (!event_id) return json({ error: 'event_id required' }, 400);
    if (!Array.isArray(candidate_ids) || candidate_ids.length === 0)
      return json({ error: 'candidate_ids required' }, 400);
    if (!Array.isArray(voter_ids) || voter_ids.length === 0)
      return json({ error: 'voter_ids required' }, 400);

    const durationSecs = Math.min(Math.max(Number(duration_seconds) || 60, 15), 180);

    // Auto-luk overskredet session
    await env.DB.prepare(
      `UPDATE vote_sessions SET status='closed' WHERE status='active' AND ends_at <= datetime('now')`
    ).run().catch(() => {});

    const id = crypto.randomUUID();
    const now = new Date();
    const endsAt = new Date(now.getTime() + durationSecs * 1000).toISOString().replace('T', ' ').slice(0, 19);
    const startedAt = now.toISOString().replace('T', ' ').slice(0, 19);

    await env.DB.prepare(
      `INSERT INTO vote_sessions (id, event_id, started_by, started_at, ends_at, status, candidates, voters)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
    ).bind(
      id, event_id, payload.sub, startedAt, endsAt,
      JSON.stringify(candidate_ids),
      JSON.stringify(voter_ids)
    ).run();

    // Push-notifikation til alle voters
    const pushMsg = {
      title: '🏆 Stem på kampens spiller!',
      body: 'Afstemningen er åben i 60 sekunder — stem nu!',
      url: '/afstemning',
    };
    await Promise.allSettled(
      (voter_ids as string[]).map(vid => sendPushToPlayer(env, vid, pushMsg))
    );

    return json({ session_id: id }, 201);
  }

  // ── DELETE /api/votes/sessions/:id — slet afstemning (trainer+) ───────────
  if (sessionId && !sub && method === 'DELETE') {
    if (payload.role !== 'trainer' && payload.role !== 'admin')
      return json({ error: 'Forbidden' }, 403);
    await env.DB.prepare('DELETE FROM votes WHERE session_id=?').bind(sessionId).run();
    await env.DB.prepare('DELETE FROM vote_sessions WHERE id=?').bind(sessionId).run();
    return json({ ok: true });
  }

  // ── POST /api/votes/sessions/:id/vote ───────────────────────────────────────
  if (sessionId && sub === 'vote' && method === 'POST') {
    const body = await request.json() as any;
    const { candidate_id } = body;
    if (!candidate_id) return json({ error: 'candidate_id required' }, 400);

    const session = await env.DB.prepare(
      `SELECT id, status, ends_at, candidates, voters FROM vote_sessions WHERE id=?`
    ).bind(sessionId).first() as any;
    if (!session) return json({ error: 'Afstemning ikke fundet' }, 404);

    if (session.status === 'closed') return json({ error: 'Afstemningen er lukket' }, 400);
    if (new Date(session.ends_at + 'Z') <= new Date()) {
      await env.DB.prepare(`UPDATE vote_sessions SET status='closed' WHERE id=?`).bind(sessionId).run();
      return json({ error: 'Afstemningen er udløbet' }, 400);
    }

    const voterIds: string[] = JSON.parse(session.voters || '[]');
    if (!voterIds.includes(payload.sub))
      return json({ error: 'Du er ikke med i denne afstemning' }, 403);

    const candidateIds: string[] = JSON.parse(session.candidates || '[]');
    if (!candidateIds.includes(candidate_id))
      return json({ error: 'Ugyldig kandidat' }, 403);

    await env.DB.prepare(
      `INSERT INTO votes (id, session_id, voter_id, candidate_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(session_id, voter_id) DO UPDATE SET candidate_id=excluded.candidate_id, created_at=datetime('now')`
    ).bind(crypto.randomUUID(), sessionId, payload.sub, candidate_id).run();

    return json({ ok: true });
  }

  // ── GET /api/votes/sessions/:id/results ────────────────────────────────────
  if (sessionId && sub === 'results' && method === 'GET') {
    const session = await env.DB.prepare(
      `SELECT vs.id, vs.event_id, vs.started_by, vs.started_at, vs.ends_at, vs.status,
              vs.candidates, vs.voters, vs.created_at,
              e.title as event_title, e.start_time,
              COALESCE(p.alias, p.name) as started_by_name
       FROM vote_sessions vs
       JOIN events e ON e.id = vs.event_id
       JOIN players p ON p.id = vs.started_by
       WHERE vs.id=?`
    ).bind(sessionId).first() as any;
    if (!session) return json({ error: 'Afstemning ikke fundet' }, 404);

    const candidateIds: string[] = JSON.parse(session.candidates || '[]');
    const votesRes = await env.DB.prepare(
      `SELECT candidate_id, COUNT(*) as votes FROM votes WHERE session_id=? GROUP BY candidate_id`
    ).bind(sessionId).all();
    const votesMap = new Map((votesRes.results as any[]).map(r => [r.candidate_id, Number(r.votes)]));

    const candidates = await getPlayerObjects(env, candidateIds);
    const results = (candidates as any[])
      .map(c => ({ ...c, votes: votesMap.get(c.id) ?? 0 }))
      .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));

    const totalVotes = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM votes WHERE session_id=?'
    ).bind(sessionId).first() as any;

    const myVote = await env.DB.prepare(
      'SELECT candidate_id FROM votes WHERE session_id=? AND voter_id=?'
    ).bind(sessionId, payload.sub).first() as any;

    return json({
      session,
      results,
      total_votes: Number(totalVotes?.count ?? 0),
      my_vote: myVote?.candidate_id ?? null,
    });
  }

  return json({ error: 'Not found' }, 404);
}
