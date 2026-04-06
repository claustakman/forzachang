import { Env } from '../index';
import { sendPushNotification, PushMessage } from './webpush';

export async function sendPushToPlayer(
  env: Env,
  playerId: string,
  message: PushMessage
): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return; // Not configured yet

  const player = await env.DB.prepare(
    'SELECT COALESCE(notify_push, 1) as notify_push FROM players WHERE id=?'
  ).bind(playerId).first();
  if (!player || !(player as any).notify_push) return;

  const subs = await env.DB.prepare(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE player_id=?'
  ).bind(playerId).all();

  for (const sub of subs.results as any[]) {
    try {
      await sendPushNotification(sub, message, {
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
        subject: env.VAPID_SUBJECT || 'mailto:admin@forzachang.eu',
      });
    } catch (e: any) {
      if (e.message === 'SUBSCRIPTION_GONE') {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE id=?')
          .bind(sub.id).run().catch(() => {});
      } else {
        console.error('Push send failed:', e.message);
      }
    }
  }
}
