// Forza Chang FC — Cloudflare Worker API
// Deploy: wrangler deploy

import { handleAuth } from './routes/auth';
import { handleMatches } from './routes/matches';
import { handleSignups } from './routes/signups';
import { handleStats } from './routes/stats';
import { handleFines } from './routes/fines';
import { handlePlayers } from './routes/players';
import { handleEvents } from './routes/events';
import { handleSettings } from './routes/settings';
import { verifyJWT, corsHeaders } from './lib/auth';

export interface Env {
  DB: D1Database;
  AVATARS: R2Bucket;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  APP_URL: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders() });
      }

      // Public routes (no auth needed)
      if (path.startsWith('/api/auth')) {
        return await handleAuth(request, env);
      }

      // All other routes require JWT
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return json({ error: 'Unauthorized' }, 401);
      }

      const token = authHeader.slice(7);
      const payload = await verifyJWT(token, env.JWT_SECRET);
      if (!payload) {
        return json({ error: 'Invalid token' }, 401);
      }

      // Route to handlers
      if (path.startsWith('/api/matches'))  return await handleMatches(request, env, payload);
      if (path.startsWith('/api/signups'))  return await handleSignups(request, env, payload);
      if (path.startsWith('/api/stats'))    return await handleStats(request, env, payload);
      if (path.startsWith('/api/fines'))    return await handleFines(request, env, payload);
      if (path.startsWith('/api/players'))  return await handlePlayers(request, env, payload);
      if (path.startsWith('/api/events'))   return await handleEvents(request, env, payload);
      if (path.startsWith('/api/settings')) return await handleSettings(request, env, payload);

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      console.error('Unhandled error:', e);
      const msg = e instanceof Error ? e.message : String(e);
      return json({ error: msg }, 500);
    }
  },

  // Scheduled job: kører dagligt kl. 09:00 UTC
  // 1) Webcal-sync: hent og synkroniser iCal-feed
  // 2) Email-påmindelser: send reminders 3 dage før kampe
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    await Promise.all([
      syncWebcal(env),
      sendReminders(env),
    ]);
  }
};

// ── Webcal-sync ───────────────────────────────────────────────────────────────

export async function syncWebcal(env: Env): Promise<void> {
  const setting = await env.DB.prepare(
    'SELECT value FROM app_settings WHERE key=?'
  ).bind('webcal_url').first();

  if (!setting?.value) return;

  const webcalUrl = (setting.value as string).replace(/^webcal:\/\//i, 'https://');

  let icalText: string;
  try {
    const res = await fetch(webcalUrl);
    if (!res.ok) { console.error('Webcal fetch failed:', res.status); return; }
    icalText = await res.text();
  } catch (e) {
    console.error('Webcal fetch error:', e);
    return;
  }

  const events = parseIcal(icalText);
  const now = new Date().getFullYear();

  for (const ev of events) {
    const existing = await env.DB.prepare(
      'SELECT id, title, start_time, location FROM events WHERE webcal_uid=?'
    ).bind(ev.uid).first();

    if (existing) {
      // Opdater kun hvis noget er ændret
      if (
        existing.title !== ev.title ||
        existing.start_time !== ev.start_time ||
        existing.location !== (ev.location || null)
      ) {
        await env.DB.prepare(`
          UPDATE events SET title=?, start_time=?, end_time=?, location=?, season=?
          WHERE webcal_uid=?
        `).bind(ev.title, ev.start_time, ev.end_time || null, ev.location || null,
          ev.season || now, ev.uid).run();
      }
    } else {
      const meetingTime = addMinutes(ev.start_time, -40);
      const signupDeadline = addDays(ev.start_time, -7);
      await env.DB.prepare(`
        INSERT INTO events (id, type, title, location, start_time, end_time, meeting_time, signup_deadline, webcal_uid, season)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).bind(
        crypto.randomUUID(), ev.type, ev.title, ev.location || null,
        ev.start_time, ev.end_time || null, meetingTime, signupDeadline, ev.uid, ev.season || now
      ).run();
    }
  }

  // Markér events der er forsvundet fra feed som aflyst (kun fremtidige)
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const uids = events.map(e => `'${e.uid.replace(/'/g, "''")}'`).join(',');
  if (uids) {
    await env.DB.prepare(`
      UPDATE events SET status='aflyst'
      WHERE webcal_uid IS NOT NULL
      AND start_time > ?
      AND webcal_uid NOT IN (${uids})
      AND status = 'aktiv'
    `).bind(tomorrow).run();
  }
}

interface IcalEvent {
  uid: string;
  title: string;
  start_time: string;
  end_time?: string;
  location?: string;
  type: 'kamp' | 'event';
  season?: number;
}

function parseIcal(text: string): IcalEvent[] {
  const events: IcalEvent[] = [];
  // Unfold continued lines
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);

  for (const block of blocks) {
    const get = (key: string) => {
      const m = block.match(new RegExp(`^${key}[^:]*:(.+)$`, 'm'));
      return m ? m[1].trim() : '';
    };

    const uid = get('UID');
    if (!uid) continue;

    const summary = get('SUMMARY').replace(/\\,/g, ',').replace(/\\n/g, ' ');
    const dtstart = get('DTSTART');
    const dtend = get('DTEND');
    const location = get('LOCATION').replace(/\\,/g, ',').replace(/\\n/g, ', ') || undefined;

    const start_time = icalDateToISO(dtstart);
    if (!start_time) continue;

    const end_time = dtend ? icalDateToISO(dtend) : undefined;
    const season = new Date(start_time).getFullYear();

    // Events fra webcal er altid kampe
    const type: 'kamp' | 'event' = 'kamp';

    events.push({ uid, title: summary, start_time, end_time, location, type, season });
  }

  return events;
}

function addMinutes(iso: string, mins: number): string {
  return new Date(new Date(iso).getTime() + mins * 60 * 1000).toISOString();
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function icalDateToISO(dt: string): string {
  if (!dt) return '';
  // YYYYMMDDTHHMMSSZ eller YYYYMMDD
  const clean = dt.replace(/[TZ]/g, ' ').trim();
  if (dt.length >= 15) {
    // Dato + tid
    const d = clean.slice(0, 8);
    const t = clean.slice(9, 15);
    return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t.slice(0,2)}:${t.slice(2,4)}:00Z`;
  }
  // Kun dato
  const d = dt.slice(0, 8);
  return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T00:00:00Z`;
}

// ── Email-påmindelser ─────────────────────────────────────────────────────────

async function sendReminders(env: Env): Promise<void> {
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  const targetDate = threeDaysFromNow.toISOString().slice(0, 10);

  const matches = await env.DB.prepare(
    `SELECT * FROM matches WHERE date = ? ORDER BY time`
  ).bind(targetDate).all();

  for (const match of matches.results) {
    const unsigned = await env.DB.prepare(`
      SELECT p.id, p.name, p.email FROM players p
      WHERE p.active = 1
      AND p.email IS NOT NULL
      AND p.id NOT IN (
        SELECT player_id FROM signups WHERE match_id = ?
      )
    `).bind(match.id).all();

    for (const player of unsigned.results) {
      if (!player.email) continue;
      await sendReminderEmail(env, player as any, match as any);
    }
  }
}

async function sendReminderEmail(env: Env, player: { name: string; email: string }, match: { date: string; time: string; opponent: string; venue: string }) {
  const venueText = match.venue === 'home' ? 'hjemmekamp' : 'udekamp';
  const dateFormatted = new Date(match.date + 'T12:00:00').toLocaleDateString('da-DK', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Forza Chang FC <noreply@forzachang.dk>',
      to: player.email,
      subject: `Husk tilmelding: ${match.opponent} ${dateFormatted}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <div style="background:#1D9E75;padding:24px;border-radius:12px 12px 0 0">
            <h1 style="color:#fff;margin:0;font-size:20px">Forza Chang FC</h1>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #eee;border-radius:0 0 12px 12px">
            <p>Hej ${player.name},</p>
            <p>Du har endnu ikke meldt dig til <strong>${match.opponent}</strong>.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr><td style="color:#666;padding:4px 0">Dato</td><td style="font-weight:500">${dateFormatted}</td></tr>
              <tr><td style="color:#666;padding:4px 0">Tid</td><td style="font-weight:500">${match.time}</td></tr>
              <tr><td style="color:#666;padding:4px 0">Type</td><td style="font-weight:500">${venueText}</td></tr>
            </table>
            <a href="${env.APP_URL}" style="display:inline-block;background:#1D9E75;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500">
              Tilmeld dig nu
            </a>
            <p style="color:#999;font-size:12px;margin-top:24px">Forza Chang FC · Du modtager denne email fordi du er registreret spiller.</p>
          </div>
        </div>
      `
    })
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function json(data: unknown, status = 200, _origin?: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}
