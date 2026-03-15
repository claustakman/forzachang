import { json } from '../index';
import { verifyPassword, createJWT } from '../lib/auth';
import type { Env } from '../index';

export async function handleAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    const { username, password } = await request.json() as { username: string; password: string };

    const player = await env.DB.prepare(
      'SELECT * FROM players WHERE id = ? AND active = 1'
    ).bind(username.toLowerCase().trim()).first();

    if (!player) return json({ error: 'Ukendt brugernavn eller kodeord' }, 401, env.APP_URL);

    const ok = await verifyPassword(password, player.password_hash as string);
    if (!ok) return json({ error: 'Ukendt brugernavn eller kodeord' }, 401, env.APP_URL);

    const token = await createJWT(
      { sub: player.id as string, name: player.name as string, role: player.role as string },
      env.JWT_SECRET
    );

    return json({ token, player: { id: player.id, name: player.name, role: player.role, email: player.email } }, 200, env.APP_URL);
  }

  return json({ error: 'Not found' }, 404, env.APP_URL);
}
