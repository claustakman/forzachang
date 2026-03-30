import { json } from '../index';
import { verifyPassword, createJWT, hashPassword, verifyJWT } from '../lib/auth';
import type { Env } from '../index';

export async function handleAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  // POST /api/auth/login
  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    const { username, password } = await request.json() as { username: string; password: string };
    const player = await env.DB.prepare(
      'SELECT * FROM players WHERE id = ? AND active = 1'
    ).bind(username.toLowerCase().trim()).first();
    if (!player) return json({ error: 'Ukendt brugernavn eller kodeord' }, 401);
    const ok = await verifyPassword(password, player.password_hash as string);
    if (!ok) return json({ error: 'Ukendt brugernavn eller kodeord' }, 401);
    const token = await createJWT(
      { sub: player.id as string, name: player.name as string, role: player.role as string },
      env.JWT_SECRET
    );
    return json({ token, player: { id: player.id, name: player.name, role: player.role, email: player.email, phone: player.phone } });
  }

  // POST /api/auth/reset-request — send password reset email
  if (url.pathname === '/api/auth/reset-request' && request.method === 'POST') {
    const { email } = await request.json() as { email: string };
    const player = await env.DB.prepare(
      'SELECT id, name, email FROM players WHERE email = ? AND active = 1'
    ).bind(email.toLowerCase().trim()).first();
    // Always return ok to avoid email enumeration
    if (!player) return json({ ok: true });
    const token = await createJWT(
      { sub: player.id as string, name: player.name as string, role: 'reset' },
      env.JWT_SECRET,
      3600 // 1 hour
    );
    await sendEmail(env, {
      to: player.email as string,
      subject: 'Nulstil dit kodeord — Copenhagen Forza Chang',
      html: resetEmailHtml(player.name as string, `${env.APP_URL}/reset?token=${token}`),
    });
    return json({ ok: true });
  }

  // POST /api/auth/reset — set new password with token
  if (url.pathname === '/api/auth/reset' && request.method === 'POST') {
    const { token, password } = await request.json() as { token: string; password: string };
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload || payload.role !== 'reset') return json({ error: 'Ugyldigt eller udløbet link' }, 400);
    const hash = await hashPassword(password);
    await env.DB.prepare('UPDATE players SET password_hash=? WHERE id=?').bind(hash, payload.sub).run();
    return json({ ok: true });
  }

  // POST /api/auth/change-password — authenticated user changes own password
  if (url.pathname === '/api/auth/change-password' && request.method === 'POST') {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const jwtPayload = await verifyJWT(authHeader.slice(7), env.JWT_SECRET);
    if (!jwtPayload) return json({ error: 'Unauthorized' }, 401);
    const { id, current, next } = await request.json() as { id: string; current: string; next: string };
    if (jwtPayload.sub !== id) return json({ error: 'Forbidden' }, 403);
    const player = await env.DB.prepare('SELECT password_hash FROM players WHERE id=?').bind(id).first();
    if (!player) return json({ error: 'Ikke fundet' }, 404);
    const ok = await verifyPassword(current, player.password_hash as string);
    if (!ok) return json({ error: 'Forkert nuværende kodeord' }, 400);
    const hash = await hashPassword(next);
    await env.DB.prepare('UPDATE players SET password_hash=? WHERE id=?').bind(hash, id).run();
    return json({ ok: true });
  }

  // POST /api/auth/invite — admin sends welcome email (requires JWT)
  if (url.pathname === '/api/auth/invite' && request.method === 'POST') {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const jwtPayload = await verifyJWT(authHeader.slice(7), env.JWT_SECRET);
    if (!jwtPayload || jwtPayload.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    const { player_id } = await request.json() as { player_id: string };
    const player = await env.DB.prepare('SELECT id, name, email FROM players WHERE id=?').bind(player_id).first();
    if (!player || !player.email) return json({ error: 'Spiller ikke fundet eller mangler email' }, 404);
    const resetToken = await createJWT(
      { sub: player.id as string, name: player.name as string, role: 'reset' },
      env.JWT_SECRET,
      7 * 24 * 3600 // 7 days
    );
    await sendEmail(env, {
      to: player.email as string,
      subject: 'Velkommen til Copenhagen Forza Chang',
      html: inviteEmailHtml(player.name as string, player.id as string, `${env.APP_URL}/reset?token=${resetToken}`),
    });
    return json({ ok: true });
  }

  return json({ error: 'Not found' }, 404);
}

async function sendEmail(env: Env, { to, subject, html }: { to: string; subject: string; html: string }) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Copenhagen Forza Chang <onboarding@resend.dev>',
      to,
      subject,
      html,
    }),
  });
}

function inviteEmailHtml(name: string, username: string, setPasswordUrl: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:12px;overflow:hidden">
      <div style="background:#111;padding:24px;text-align:center;border-bottom:1px solid #2a2a2a">
        <h1 style="margin:0;font-size:20px;font-family:Georgia,serif">Copenhagen Forza Chang</h1>
      </div>
      <div style="padding:24px">
        <p>Hej ${name},</p>
        <p>Du er nu oprettet som spiller i CFC-appen.</p>
        <p style="color:#888">Dit brugernavn er: <strong style="color:#fff">${username}</strong></p>
        <p style="margin:20px 0">Klik på knappen nedenfor for at vælge dit kodeord og logge ind første gang:</p>
        <a href="${setPasswordUrl}" style="display:inline-block;background:#fff;color:#000;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
          Sæt dit kodeord
        </a>
        <p style="color:#555;font-size:12px;margin-top:24px">Linket udløber om 7 dage.</p>
      </div>
    </div>`;
}

function resetEmailHtml(name: string, resetUrl: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:12px;overflow:hidden">
      <div style="background:#111;padding:24px;text-align:center;border-bottom:1px solid #2a2a2a">
        <h1 style="margin:0;font-size:20px;font-family:Georgia,serif">Copenhagen Forza Chang</h1>
      </div>
      <div style="padding:24px">
        <p>Hej ${name},</p>
        <p>Vi har modtaget en anmodning om at nulstille dit kodeord.</p>
        <p style="margin:20px 0">Klik på knappen nedenfor for at vælge et nyt kodeord:</p>
        <a href="${resetUrl}" style="display:inline-block;background:#fff;color:#000;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
          Nulstil kodeord
        </a>
        <p style="color:#555;font-size:12px;margin-top:24px">Linket udløber om 1 time. Hvis du ikke anmodede om dette, kan du ignorere denne email.</p>
      </div>
    </div>`;
}
