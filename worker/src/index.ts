// Forza Chang FC — Cloudflare Worker API
// Deploy: wrangler deploy

import { handleAuth } from './routes/auth';
import { handleMatches } from './routes/matches';
import { handleSignups } from './routes/signups';
import { handleStats } from './routes/stats';
import { handleFines } from './routes/fines';
import { handlePlayers } from './routes/players';
import { verifyJWT, corsHeaders } from './lib/auth';

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  APP_URL: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders(origin) });
      }

      // Public routes (no auth needed)
      if (path.startsWith('/api/auth')) {
        return handleAuth(request, env);
      }

      // All other routes require JWT
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return json({ error: 'Unauthorized' }, 401, origin);
      }

      const token = authHeader.slice(7);
      const payload = await verifyJWT(token, env.JWT_SECRET);
      if (!payload) {
        return json({ error: 'Invalid token' }, 401, origin);
      }

      // Route to handlers
      if (path.startsWith('/api/matches')) return handleMatches(request, env, payload);
      if (path.startsWith('/api/signups')) return handleSignups(request, env, payload);
      if (path.startsWith('/api/stats'))   return handleStats(request, env, payload);
      if (path.startsWith('/api/fines'))   return handleFines(request, env, payload);
      if (path.startsWith('/api/players')) return handlePlayers(request, env, payload);

      return json({ error: 'Not found' }, 404, origin);
    } catch (e) {
      console.error('Unhandled error:', e);
      return json({ error: 'Internal server error' }, 500, origin);
    }
  },

  // Scheduled job: send reminders 3 days before each match
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const targetDate = threeDaysFromNow.toISOString().slice(0, 10);

    const matches = await env.DB.prepare(
      `SELECT * FROM matches WHERE date = ? ORDER BY time`
    ).bind(targetDate).all();

    for (const match of matches.results) {
      // Find players who haven't responded
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
};

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

export function json(data: unknown, status = 200, origin?: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
  });
}
