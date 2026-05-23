import { Env } from '../index';
import { corsHeaders } from '../lib/auth';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

export interface LeagueRow {
  position: number;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  points: number;
  is_cfc: boolean;
  separator: boolean; // true = linje under denne række (lineType1)
}

export interface LeagueTable {
  league_name: string;
  rows: LeagueRow[];
  fetched_at: string;
}

// CFC navne der skal highlightes
const CFC_NAMES = ['cfc', 'forza chang', 'copenhagen forza chang', 'cph. forza chang', 'cph forza chang'];

function isCFC(name: string): boolean {
  const lower = name.toLowerCase().trim();
  return CFC_NAMES.some(n => lower.includes(n));
}

function extractText(html: string, tag: string, cls: string): string {
  // Match <td class="cls"> ... </td> content
  const re = new RegExp(`<td[^>]+class="${cls}"[^>]*>\\s*(?:<[^>]+>\\s*)*([^<]*)`, 'i');
  const m = html.match(re);
  return m ? m[1].trim() : '';
}

export async function handleLeagueTable(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  // Hent standings_url fra settings
  const setting = await env.DB.prepare(
    'SELECT value FROM app_settings WHERE key = ?'
  ).bind('standings_url').first<{ value: string }>();

  if (!setting?.value) {
    return json({ error: 'Ingen stilling-URL konfigureret' }, 404);
  }

  const url = setting.value;

  let html: string;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ForzaChangApp/1.0)' },
    });
    if (!res.ok) throw new Error(`DAI-sport svarede ${res.status}`);
    html = await res.text();
  } catch (e) {
    return json({ error: 'Kunne ikke hente stilling fra DAI-sport' }, 502);
  }

  // Udtræk rækkens navn (<h2 class="sr">)
  const leagueMatch = html.match(/<h2[^>]+class="sr"[^>]*>([^<]+)<\/h2>/i);
  const leagueName = leagueMatch ? leagueMatch[1].trim() : '';

  // Udtræk alle tabelrækker
  // Hver spiller-række er <tr class="srOdd"> eller <tr class="srEven">
  // Separator-rækker er <tr id="...line">
  const rows: LeagueRow[] = [];

  // Split HTML på tabelrækker
  const trRegex = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
  let match: RegExpExecArray | null;
  let lastRowIdx = -1;

  while ((match = trRegex.exec(html)) !== null) {
    const attrs = match[1];
    const content = match[2];

    // Separator-linje: id indeholder "line" og class ikke sr
    if (attrs.includes('lineType1')) {
      if (rows.length > 0) {
        rows[rows.length - 1].separator = true;
      }
      continue;
    }

    // Kun srOdd og srEven er data-rækker
    if (!attrs.includes('srOdd') && !attrs.includes('srEven')) continue;

    // Udtræk celler
    const cell = (cls: string): string => {
      const re = new RegExp(`<td[^>]+class="${cls}"[^>]*>([\\s\\S]*?)<\\/td>`, 'i');
      const m = content.match(re);
      if (!m) return '';
      // Strip tags
      return m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    };

    const position = parseInt(cell('c01'), 10);
    const teamRaw = cell('c02');
    const played = parseInt(cell('c04'), 10);
    const won = parseInt(cell('c05'), 10);
    const drawn = parseInt(cell('c06'), 10);
    const lost = parseInt(cell('c07'), 10);
    const goalsFor = parseInt(cell('c08'), 10);
    const goalsAgainst = parseInt(cell('c10'), 10);
    const points = parseInt(cell('c12'), 10);

    if (isNaN(position) || isNaN(played)) continue;

    rows.push({
      position,
      team: teamRaw,
      played: isNaN(played) ? 0 : played,
      won: isNaN(won) ? 0 : won,
      drawn: isNaN(drawn) ? 0 : drawn,
      lost: isNaN(lost) ? 0 : lost,
      goals_for: isNaN(goalsFor) ? 0 : goalsFor,
      goals_against: isNaN(goalsAgainst) ? 0 : goalsAgainst,
      points: isNaN(points) ? 0 : points,
      is_cfc: isCFC(teamRaw),
      separator: false,
    });
  }

  const table: LeagueTable = {
    league_name: leagueName,
    rows,
    fetched_at: new Date().toISOString(),
  };

  return json(table);
}
