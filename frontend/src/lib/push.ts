const BASE = import.meta.env.PROD
  ? 'https://forzachang-api.claus-takman.workers.dev/api'
  : '/api';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from([...atob(base64)].map(c => c.charCodeAt(0)));
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function getPushPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function subscribeToPush(token: string): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const res = await fetch(`${BASE}/vapid-public-key`);
    const { publicKey } = await res.json() as { publicKey: string };

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const subJson = subscription.toJSON();
    const saveRes = await fetch(`${BASE}/push-subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
      }),
    });

    return saveRes.ok;
  } catch (e) {
    console.error('subscribeToPush failed:', e);
    return false;
  }
}

export async function unsubscribeFromPush(token: string): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();

    await fetch(`${BASE}/push-subscriptions`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ endpoint }),
    });

    return true;
  } catch (e) {
    console.error('unsubscribeFromPush failed:', e);
    return false;
  }
}
