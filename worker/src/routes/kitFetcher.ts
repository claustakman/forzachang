import { json, Env } from '../index';
import type { JWTPayload } from '../lib/auth';

// Farver der kolliderer med CFCs Sort/Hvid-kit
const CONFLICT_COLORS = ['sort', 'hvid', 'black', 'white'];

export function kitConflict(kit: string): boolean {
  const lower = kit.toLowerCase();
  return CONFLICT_COLORS.some(c => lower.includes(c));
}

function stripHtml(html: string): string {
  return html.replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

export async function handleFetchKits(request: Request, env: Env, user: JWTPayload): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  // Hent standings_url → udtræk PuljeId
  const setting = await env.DB.prepare(
    "SELECT value FROM app_settings WHERE key='standings_url'"
  ).first() as any;

  if (!setting?.value) return json({ error: 'standings_url ikke konfigureret' }, 400);

  const puljeIdMatch = (setting.value as string).match(/PuljeId=(\d+)/i);
  if (!puljeIdMatch) return json({ error: 'Kan ikke udtrække PuljeId fra standings_url' }, 400);
  const puljeId = puljeIdMatch[1];

  // Hent Holdoversigt
  const overviewUrl = `https://resultater.dai-sport.dk/tms/Turneringer-og-resultater/Pulje-Holdoversigt.aspx?PuljeId=${puljeId}`;
  let overviewHtml: string;
  try {
    const res = await fetch(overviewUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ForzaChangApp/1.0)' },
    });
    if (!res.ok) return json({ error: `Holdoversigt fetch fejlede: ${res.status}` }, 502);
    overviewHtml = await res.text();
  } catch (e) {
    return json({ error: 'Kunne ikke hente Holdoversigt fra DAI-sport' }, 502);
  }

  // Parser: <a href="/tms/.../Hold-Information.aspx?HoldId=NNNN">Holdnavn</a>
  const teamPattern = /Hold-Information\.aspx\?HoldId=(\d+)[^>]*>([^<]+)<\/a>/gi;
  const teams: { id: string; name: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = teamPattern.exec(overviewHtml)) !== null) {
    teams.push({ id: m[1], name: m[2].trim() });
  }

  if (teams.length === 0) {
    return json({ error: 'Ingen hold fundet i Holdoversigt' }, 502);
  }

  let eventsUpdated = 0;

  for (const team of teams) {
    // Spring CFC over
    if (/cfc|forza chang|copenhagen forza|cph\.? forza/i.test(team.name)) continue;

    // Hent Hold-Information
    let infoHtml: string;
    try {
      const res = await fetch(
        `https://resultater.dai-sport.dk/tms/Turneringer-og-resultater/Hold-Information.aspx?HoldId=${team.id}`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ForzaChangApp/1.0)' } }
      );
      if (!res.ok) continue;
      infoHtml = await res.text();
    } catch {
      continue;
    }

    // Parser Spilletøj 1
    const kitMatch = infoHtml.match(/Spilletøj\s+1[\s\S]*?<td[^>]+class="c02"[^>]*>([\s\S]*?)<\/td>/i);
    if (!kitMatch) continue;

    const kit = stripHtml(kitMatch[1]);
    if (!kit || kit === 'Ikke angivet') continue;

    // Match mod webcal-kampe i databasen
    // events.title kan være "Modstander - CFC" eller "CFC - Modstander"
    const nameForMatch = `%${team.name.toLowerCase()}%`;
    const matchingEvents = await env.DB.prepare(`
      SELECT id FROM events
      WHERE type = 'kamp'
        AND webcal_uid IS NOT NULL
        AND LOWER(title) LIKE ?
    `).bind(nameForMatch).all();

    for (const ev of (matchingEvents.results as any[])) {
      await env.DB.prepare('UPDATE events SET opponent_kit=? WHERE id=?')
        .bind(kit, ev.id).run();
      eventsUpdated++;
    }
  }

  return json({ ok: true, teams_processed: teams.length, events_updated: eventsUpdated });
}
