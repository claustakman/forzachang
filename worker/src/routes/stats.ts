import { json, Env } from '../index';
import type { JWTPayload } from '../lib/auth';
import { autoAssignHonors } from './honors';
import { updateTeamRecords } from './records';

function nanoid() { return crypto.randomUUID(); }

export async function handleStats(request: Request, env: Env, user: JWTPayload): Promise<Response> {
  const url = new URL(request.url);
  const isTrainer = user.role === 'trainer' || user.role === 'admin';

  // ── GET /api/stats?season=&player_id= ────────────────────────────────────
  if (request.method === 'GET') {
    const season = url.searchParams.get('season');
    const playerId = url.searchParams.get('player_id');

    // Spillerprofil: alle sæsoner for én spiller (legacy + match_stats kombineret)
    if (playerId) {
      const legacy = await env.DB.prepare(`
        SELECT season,
          matches, goals, mom, yellow_cards, red_cards, fines_amount
        FROM player_stats_legacy
        WHERE player_id = ?
        ORDER BY season DESC
      `).bind(playerId).all();

      const modern = await env.DB.prepare(`
        SELECT e.season,
          COUNT(*) as matches,
          COALESCE(SUM(ms.goals), 0) as goals,
          COALESCE(SUM(ms.mom), 0) as mom,
          COALESCE(SUM(ms.yellow_cards), 0) as yellow_cards,
          COALESCE(SUM(ms.red_cards), 0) as red_cards,
          0 as fines_amount
        FROM match_stats ms
        JOIN events e ON e.id = ms.event_id
        WHERE ms.player_id = ? AND ms.played = 1
        GROUP BY e.season
        ORDER BY e.season DESC
      `).bind(playerId).all();

      // Bøder fra fines-tabellen per sæson (fase 6)
      let finesBySeason = new Map<number, number>();
      try {
        const fr = await env.DB.prepare(`
          SELECT CAST(strftime('%Y', ev.start_time) AS INTEGER) as season,
            COALESCE(SUM(f.amount), 0) as fines_amount
          FROM fines f
          LEFT JOIN events ev ON ev.id = f.event_id
          WHERE f.player_id = ?
          GROUP BY season
        `).bind(playerId).all();
        for (const r of fr.results as any[]) {
          if (r.season) finesBySeason.set(r.season, r.fines_amount);
        }
      } catch { /* tabellen eksisterer ikke endnu */ }

      // Merge: modern stats vinder over legacy for samme sæson
      const modernSeasons = new Set((modern.results as any[]).map(r => r.season));
      const legacyFiltered = (legacy.results as any[]).filter(r => !modernSeasons.has(r.season));
      const combined = [...(modern.results as any[]), ...legacyFiltered]
        .sort((a, b) => b.season - a.season)
        .map(r => ({
          ...r,
          fines_amount: (r.fines_amount || 0) + (finesBySeason.get(r.season) || 0),
        }));

      return json(combined);
    }

    // Samlet rangordning: legacy + match_stats kombineret per spiller
    // Bruges til leaderboards og sæsonoversigt
    const seasonFilter = season ? `AND e.season = ${Number(season)}` : '';
    const legacySeasonFilter = season ? `AND psl.season = ${Number(season)}` : '';
    const finesSeasonFilter = season ? `AND strftime('%Y', ev.start_time) = '${Number(season)}'` : '';

    const modernRows = await env.DB.prepare(`
      SELECT
        p.id,
        p.name as full_name,
        p.alias,
        p.avatar_url,
        p.active,
        e.season,
        COALESCE(SUM(CASE WHEN ms.played=1 THEN 1 ELSE 0 END), 0) as matches,
        COALESCE(SUM(ms.goals), 0) as goals,
        COALESCE(SUM(ms.mom), 0) as mom,
        COALESCE(SUM(ms.yellow_cards), 0) as yellow_cards,
        COALESCE(SUM(ms.red_cards), 0) as red_cards
      FROM players p
      JOIN match_stats ms ON ms.player_id = p.id
      JOIN events e ON e.id = ms.event_id
      WHERE 1=1 ${seasonFilter}
      GROUP BY p.id, e.season
    `).all();

    const legacyRows = await env.DB.prepare(`
      SELECT
        p.id,
        p.name as full_name,
        p.alias,
        p.avatar_url,
        p.active,
        psl.season,
        psl.matches,
        psl.goals,
        psl.mom,
        psl.yellow_cards,
        psl.red_cards,
        psl.fines_amount
      FROM player_stats_legacy psl
      JOIN players p ON p.id = psl.player_id
      WHERE 1=1 ${legacySeasonFilter}
    `).all();

    // Bøder fra fines-tabellen (fase 6) — grupperet per spiller
    let finesRows: any[] = [];
    try {
      const fr = await env.DB.prepare(`
        SELECT f.player_id, COALESCE(SUM(f.amount), 0) as fines_amount
        FROM fines f
        LEFT JOIN events ev ON ev.id = f.event_id
        WHERE 1=1 ${finesSeasonFilter}
        GROUP BY f.player_id
      `).all();
      finesRows = fr.results as any[];
    } catch { /* tabellen eksisterer ikke endnu */ }
    const finesMap = new Map<string, number>(finesRows.map(r => [r.player_id, r.fines_amount]));

    // Aggreger per spiller (summer alle sæsoner hvis ingen sæsonfilter)
    type Row = { id: string; name: string; full_name: string; alias?: string; avatar_url?: string; active: number; season?: number; matches: number; goals: number; mom: number; yellow_cards: number; red_cards: number; fines_amount: number };
    const map = new Map<string, Row>();

    // Moderne sæsoner der er dækket af match_stats
    const modernSeasonsByPlayer = new Map<string, Set<number>>();
    for (const r of modernRows.results as any[]) {
      if (!modernSeasonsByPlayer.has(r.id)) modernSeasonsByPlayer.set(r.id, new Set());
      modernSeasonsByPlayer.get(r.id)!.add(r.season);
      const displayName = r.alias?.trim() || r.full_name;
      const ex = map.get(r.id);
      if (ex) {
        ex.matches += r.matches; ex.goals += r.goals; ex.mom += r.mom;
        ex.yellow_cards += r.yellow_cards; ex.red_cards += r.red_cards;
      } else {
        map.set(r.id, { id: r.id, name: displayName, full_name: r.full_name, alias: r.alias, avatar_url: r.avatar_url, active: r.active, matches: r.matches, goals: r.goals, mom: r.mom, yellow_cards: r.yellow_cards, red_cards: r.red_cards, fines_amount: 0 });
      }
    }

    // Legacy — kun for sæsoner der ikke er dækket af match_stats for denne spiller
    for (const r of legacyRows.results as any[]) {
      const coveredSeasons = modernSeasonsByPlayer.get(r.id);
      if (coveredSeasons?.has(r.season)) continue; // moderne data vinder
      const displayName = r.alias?.trim() || r.full_name;
      const ex = map.get(r.id);
      if (ex) {
        ex.matches += r.matches; ex.goals += r.goals; ex.mom += r.mom;
        ex.yellow_cards += r.yellow_cards; ex.red_cards += r.red_cards;
        ex.fines_amount += (r.fines_amount || 0);
      } else {
        map.set(r.id, { id: r.id, name: displayName, full_name: r.full_name, alias: r.alias, avatar_url: r.avatar_url, active: r.active, matches: r.matches, goals: r.goals, mom: r.mom, yellow_cards: r.yellow_cards, red_cards: r.red_cards, fines_amount: r.fines_amount || 0 });
      }
    }

    // Tilføj bøder fra fines-tabellen (fase 6) oven på legacy
    for (const [playerId, amt] of finesMap) {
      const ex = map.get(playerId);
      if (ex) ex.fines_amount += amt;
      // Spillere der kun har bøder men ingen kampe tilføjes ikke her — filtreres ud af matches > 0
    }

    const results = Array.from(map.values())
      .filter(r => r.matches > 0)
      .sort((a, b) => b.goals - a.goals || b.matches - a.matches);

    return json(results);
  }

  // ── GET /api/events/:id/stats (håndteres via events route, stub her) ─────
  // ── POST /api/stats — gem kampstatistik for et event (trainer+) ──────────
  if (request.method === 'POST') {
    if (!isTrainer) return json({ error: 'Forbidden' }, 403);

    const body = await request.json() as any;

    // Bulk-gem: { event_id, rows: [{player_id, goals, yellow_cards, red_cards, mom, played}] }
    if (body.event_id && Array.isArray(body.rows)) {
      // Hent auto-assign bødetyper én gang
      const absenceFineType = await env.DB.prepare(
        "SELECT id, amount FROM fine_types WHERE auto_assign='absence' AND active=1 LIMIT 1"
      ).first() as { id: string; amount: number } | null;
      const lateSignupFineType = await env.DB.prepare(
        "SELECT id, amount FROM fine_types WHERE auto_assign='late_signup' AND active=1 LIMIT 1"
      ).first() as { id: string; amount: number } | null;
      const noSignupFineType = await env.DB.prepare(
        "SELECT id, amount FROM fine_types WHERE auto_assign='no_signup' AND active=1 LIMIT 1"
      ).first() as { id: string; amount: number } | null;

      for (const row of body.rows) {
        const { player_id, goals = 0, yellow_cards = 0, red_cards = 0, mom = 0, played = 1, late_signup = 0, absence = 0, no_signup = 0 } = row;
        const existing = await env.DB.prepare(
          'SELECT id FROM match_stats WHERE event_id=? AND player_id=?'
        ).bind(body.event_id, player_id).first();
        if (existing) {
          await env.DB.prepare(
            'UPDATE match_stats SET goals=?,yellow_cards=?,red_cards=?,mom=?,played=?,late_signup=?,absence=? WHERE event_id=? AND player_id=?'
          ).bind(goals, yellow_cards, red_cards, mom ? 1 : 0, played, late_signup ? 1 : 0, absence ? 1 : 0, body.event_id, player_id).run();
        } else {
          await env.DB.prepare(
            'INSERT INTO match_stats (id,event_id,player_id,goals,yellow_cards,red_cards,mom,played,late_signup,absence) VALUES(?,?,?,?,?,?,?,?,?,?)'
          ).bind(nanoid(), body.event_id, player_id, goals, yellow_cards, red_cards, mom ? 1 : 0, played, late_signup ? 1 : 0, absence ? 1 : 0).run();
        }

        // Auto-tildel bøder
        if (absence && absenceFineType) {
          await env.DB.prepare(
            'INSERT OR IGNORE INTO fines (id, player_id, fine_type_id, event_id, amount, assigned_by) VALUES (?,?,?,?,?,?)'
          ).bind(nanoid(), player_id, absenceFineType.id, body.event_id, absenceFineType.amount, user.sub).run();
        }
        if (late_signup && lateSignupFineType) {
          await env.DB.prepare(
            'INSERT OR IGNORE INTO fines (id, player_id, fine_type_id, event_id, amount, assigned_by) VALUES (?,?,?,?,?,?)'
          ).bind(nanoid(), player_id, lateSignupFineType.id, body.event_id, lateSignupFineType.amount, user.sub).run();
        }
        if (no_signup && noSignupFineType) {
          await env.DB.prepare(
            'INSERT OR IGNORE INTO fines (id, player_id, fine_type_id, event_id, amount, assigned_by) VALUES (?,?,?,?,?,?)'
          ).bind(nanoid(), player_id, noSignupFineType.id, body.event_id, noSignupFineType.amount, user.sub).run();
        }
      }

      // Auto-tildel hædersbevisninger for alle spillere der netop fik gemt stats
      try {
        const playerIds = (body.rows as any[]).map((r: any) => r.player_id).filter(Boolean);
        if (playerIds.length) {
          await autoAssignHonors(env, playerIds);
        }
      } catch (e) {
        console.error('autoAssignHonors failed:', e);
      }

      updateTeamRecords(env).catch(e => console.error('updateTeamRecords failed:', e));

      return json({ ok: true });
    }

    // Legacy single-row (bagudkompatibel med gammel Admin.tsx)
    const { match_id, player_id, goals, yellow_cards, red_cards, played } = body;
    if (match_id && player_id) {
      const existing = await env.DB.prepare(
        'SELECT id FROM stats WHERE match_id = ? AND player_id = ?'
      ).bind(match_id, player_id).first();
      if (existing) {
        await env.DB.prepare(
          'UPDATE stats SET goals=?,yellow_cards=?,red_cards=?,played=? WHERE match_id=? AND player_id=?'
        ).bind(goals || 0, yellow_cards || 0, red_cards || 0, played ?? 1, match_id, player_id).run();
      } else {
        await env.DB.prepare(
          'INSERT INTO stats (id,match_id,player_id,goals,yellow_cards,red_cards,played) VALUES(?,?,?,?,?,?,?)'
        ).bind(nanoid(), match_id, player_id, goals || 0, yellow_cards || 0, red_cards || 0, played ?? 1).run();
      }
      return json({ ok: true });
    }

    return json({ error: 'Ugyldigt request-format' }, 400);
  }

  return json({ error: 'Method not allowed' }, 405);
}

// ── GET /api/events/:id/stats ──────────────────────────────────────────────
// Returnerer eksisterende stats for event + liste over tilmeldte spillere
// Auto-beregner late_signup og absence ud fra signup-data
export async function handleEventStats(request: Request, env: Env, user: JWTPayload, eventId: string): Promise<Response> {
  const isTrainer = user.role === 'trainer' || user.role === 'admin';
  if (!isTrainer) return json({ error: 'Forbidden' }, 403);

  const event = await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(eventId).first();
  if (!event) return json({ error: 'Ikke fundet' }, 404);

  // Tilmeldte + afmeldte spillere inkl. signup-tidspunkt
  const signupsRaw = await env.DB.prepare(`
    SELECT p.id, COALESCE(p.alias, p.name) as name, p.avatar_url, es.status, es.created_at as signed_at
    FROM event_signups es
    JOIN players p ON p.id = es.player_id
    WHERE es.event_id = ?
    ORDER BY es.status, name
  `).bind(eventId).all();

  // Alle aktive spillere — for at finde spillere der slet ikke har reageret
  const allActivePlayers = await env.DB.prepare(
    "SELECT id, COALESCE(alias, name) as name, avatar_url FROM players WHERE active=1"
  ).all();

  // Spillere uden nogen signup (ingen tilmelding eller afmelding)
  const signupIds = new Set((signupsRaw.results as any[]).map((s: any) => s.id));
  const noSignupPlayers = (allActivePlayers.results as any[]).filter((p: any) => !signupIds.has(p.id));
  const noSignupEntries = noSignupPlayers.map((p: any) => ({ ...p, status: 'ikke meldt', signed_at: null }));

  // Samlet liste: tilmeldte/afmeldte + ikke-meldt
  const allSignups = [...(signupsRaw.results as any[]), ...noSignupEntries];

  // Eksisterende stats
  const existing = await env.DB.prepare(
    'SELECT * FROM match_stats WHERE event_id=?'
  ).bind(eventId).all();

  // Auto-beregn late_signup, absence og no_signup for spillere uden eksisterende stats
  const existingIds = new Set((existing.results as any[]).map(r => r.player_id));
  const deadline = event.signup_deadline as string | null;
  const eventStart = event.start_time as string;

  const autoStats = allSignups.map((s: any) => {
    if (existingIds.has(s.id)) return null; // bruger eksisterende
    const absence    = s.status === 'afmeldt' ? 1 : 0;
    const no_signup  = s.status === 'ikke meldt' ? 1 : 0;
    const played     = (absence || no_signup) ? 0 : 1;
    const late_signup = (!absence && !no_signup && deadline && s.signed_at > deadline) ? 1 : 0;
    return { player_id: s.id, goals: 0, yellow_cards: 0, red_cards: 0, mom: 0, played, late_signup, absence, no_signup };
  }).filter(Boolean);

  // Bødetyper og eksisterende bøder for dette event
  // try/catch: robusthed hvis fase 6-tabellerne endnu ikke er migreret i prod
  let fineTypes: any[] = [];
  let existingFines: any[] = [];
  try {
    const [ft, ef] = await Promise.all([
      env.DB.prepare('SELECT * FROM fine_types WHERE active=1 ORDER BY sort_order, name').all(),
      env.DB.prepare('SELECT player_id, fine_type_id FROM fines WHERE event_id=?').bind(eventId).all(),
    ]);
    fineTypes = ft.results as any[];
    existingFines = ef.results as any[];
  } catch {
    // Tabellerne eksisterer ikke endnu — returnér tomme lister
  }

  return json({
    event,
    signups: allSignups,
    stats: existing.results,
    auto_stats: autoStats,
    fine_types: fineTypes,
    existing_fines: existingFines,
  });
}
