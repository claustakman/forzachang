import { json, Env } from '../index';
import type { JWTPayload } from '../lib/auth';

export async function handleRecords(
  request: Request,
  env: Env,
  user: JWTPayload,
  recordId?: string,
): Promise<Response> {
  const isAdmin = user.role === 'admin';

  // ── GET /api/records — alle rekorder grupperet per team_type ──────────────
  if (request.method === 'GET') {
    const rows = await env.DB.prepare(
      'SELECT * FROM team_records ORDER BY team_type, sort_order, label'
    ).all();
    const grouped = {
      oldboys: (rows.results as any[]).filter(r => r.team_type === 'oldboys'),
      senior:  (rows.results as any[]).filter(r => r.team_type === 'senior'),
    };
    return json(grouped);
  }

  // ── PUT /api/records/:id (admin) ──────────────────────────────────────────
  if (request.method === 'PUT' && recordId) {
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);
    const body = await request.json() as any;
    const { value, context, label } = body;
    await env.DB.prepare(
      "UPDATE team_records SET value=?, context=?, label=COALESCE(?,label), updated_at=datetime('now') WHERE id=?"
    ).bind(value ?? null, context ?? null, label ?? null, recordId).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}

// ── Auto-opdatering af oldboys-rekorder ───────────────────────────────────────
// Køres efter gem af kampstatistik og ved daglig cron

export async function updateTeamRecords(env: Env): Promise<void> {
  // Hent alle afsluttede kampe (med resultat) fra events + match_stats
  // Vi bruger events.result (fx "3-1") direkte
  const eventsWithResult = await env.DB.prepare(`
    SELECT e.id, e.result, e.start_time, e.season
    FROM events e
    WHERE e.type = 'kamp'
    AND e.result IS NOT NULL
    AND e.status = 'aktiv'
    ORDER BY e.start_time ASC
  `).all() as { results: any[] };

  if (!eventsWithResult.results.length) return;

  // Parser resultat-streng fx "3-1" → { for, against, diff, isWin, isDraw }
  type GameResult = {
    for: number; against: number; diff: number;
    isWin: boolean; isDraw: boolean; isLoss: boolean;
    date: string; season: number;
  };

  const games: GameResult[] = [];
  for (const e of eventsWithResult.results) {
    if (!e.result) continue;
    const parts = String(e.result).split('-').map(Number);
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) continue;
    const [f, a] = parts;
    games.push({
      for: f, against: a, diff: f - a,
      isWin: f > a, isDraw: f === a, isLoss: f < a,
      date: e.start_time?.slice(0, 10) || '',
      season: e.season || 0,
    });
  }

  if (!games.length) return;

  // Beregn rekorder ──────────────────────────────────────────────────────────

  // Per sæson aggregater
  const bySeason = new Map<number, { pts: number; gf: number; ga: number; diff: number }>();
  for (const g of games) {
    const prev = bySeason.get(g.season) || { pts: 0, gf: 0, ga: 0, diff: 0 };
    prev.pts  += g.isWin ? 3 : g.isDraw ? 1 : 0;
    prev.gf   += g.for;
    prev.ga   += g.against;
    prev.diff += g.diff;
    bySeason.set(g.season, prev);
  }

  let bestPts = 0; let bestPtsSeason = 0;
  let bestDiff = -Infinity; let bestDiffSeason = 0;
  let mostGF = 0; let mostGFSeason = 0;
  let fewestGA = Infinity; let fewestGASeason = 0;

  for (const [season, agg] of bySeason) {
    if (agg.pts > bestPts)   { bestPts = agg.pts; bestPtsSeason = season; }
    if (agg.diff > bestDiff) { bestDiff = agg.diff; bestDiffSeason = season; }
    if (agg.gf > mostGF)     { mostGF = agg.gf; mostGFSeason = season; }
    if (agg.ga < fewestGA)   { fewestGA = agg.ga; fewestGASeason = season; }
  }

  // Største sejr
  let biggestWinMargin = 0; let biggestWinResult = ''; let biggestWinDate = '';
  for (const g of games) {
    if (g.isWin && g.diff > biggestWinMargin) {
      biggestWinMargin = g.diff;
      biggestWinResult = `${g.for}-${g.against}`;
      biggestWinDate = g.date;
    }
  }

  // Sekvenser
  function longestStreak(pred: (g: GameResult) => boolean): { len: number; start: string; end: string } {
    let max = 0; let cur = 0; let curStart = ''; let bestStart = ''; let bestEnd = '';
    for (const g of games) {
      if (pred(g)) {
        if (cur === 0) curStart = g.date;
        cur++;
        if (cur > max) { max = cur; bestStart = curStart; bestEnd = g.date; }
      } else { cur = 0; }
    }
    return { len: max, start: bestStart, end: bestEnd };
  }

  const winStreak      = longestStreak(g => g.isWin);
  const unbeatenStreak = longestStreak(g => !g.isLoss);
  const scoringStreak  = longestStreak(g => g.for > 0);
  const cleanStreak    = longestStreak(g => g.against === 0);

  // Opdater rekorder i DB (kun hvis ny værdi er bedre end eksisterende auto_update=1 rekord)
  const updates: { key: string; value: string; context: string }[] = [];

  if (bestPts > 0)       updates.push({ key: 'most_points_season', value: String(bestPts), context: String(bestPtsSeason) });
  if (bestDiff > -Infinity && isFinite(bestDiff)) updates.push({ key: 'best_goal_diff_season', value: `+${bestDiff}`, context: String(bestDiffSeason) });
  if (mostGF > 0)        updates.push({ key: 'most_goals_scored_season', value: String(mostGF), context: String(mostGFSeason) });
  if (fewestGA < Infinity && isFinite(fewestGA))  updates.push({ key: 'fewest_goals_conceded_season', value: String(fewestGA), context: String(fewestGASeason) });
  if (biggestWinResult)  updates.push({ key: 'biggest_win', value: biggestWinResult, context: biggestWinDate });
  if (winStreak.len > 0) updates.push({ key: 'longest_win_streak', value: String(winStreak.len), context: `${winStreak.start} – ${winStreak.end}` });
  if (unbeatenStreak.len > 0) updates.push({ key: 'longest_unbeaten_streak', value: String(unbeatenStreak.len), context: `${unbeatenStreak.start} – ${unbeatenStreak.end}` });
  if (scoringStreak.len > 0)  updates.push({ key: 'longest_scoring_streak', value: String(scoringStreak.len), context: `${scoringStreak.start} – ${scoringStreak.end}` });
  if (cleanStreak.len > 0)    updates.push({ key: 'longest_clean_sheet_streak', value: String(cleanStreak.len), context: `${cleanStreak.start} – ${cleanStreak.end}` });

  for (const u of updates) {
    await env.DB.prepare(`
      UPDATE team_records SET value=?, context=?, updated_at=datetime('now')
      WHERE team_type='oldboys' AND record_key=? AND auto_update=1
    `).bind(u.value, u.context, u.key).run();
  }
}
