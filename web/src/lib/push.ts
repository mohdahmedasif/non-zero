import { api } from '../api/client';

export const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** iOS only delivers web push to apps added to the home screen. */
export const needsInstallForPush =
  /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches;

// The browser has one push subscription per device; each profile opts in to it
// separately, and this remembers which profiles have.
const flagKey = (profileId: string) => `nz.push.${profileId}`;

export const pushEnabled = (profileId: string) =>
  pushSupported && Notification.permission === 'granted' && localStorage.getItem(flagKey(profileId)) !== null;

function decodeKey(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const ready = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);
  if (!ready) throw new Error('Notifications need the installed or built app; they are off in the dev server.');
  return ready;
}

export async function enablePush(profileId: string): Promise<void> {
  if ((await Notification.requestPermission()) !== 'granted') {
    throw new Error('Notifications are blocked for this site. Allow them in the browser settings.');
  }
  const reg = await registration();
  const { publicKey } = await api.get<{ publicKey: string }>('/api/push/key');
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) as BufferSource }));
  const { endpoint, keys } = subscription.toJSON();
  await api.post('/api/push/subscribe', {
    endpoint,
    keys,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  localStorage.setItem(flagKey(profileId), endpoint!);
}

export async function disablePush(profileId: string): Promise<void> {
  const endpoint = localStorage.getItem(flagKey(profileId));
  if (endpoint) await api.post('/api/push/unsubscribe', { endpoint });
  localStorage.removeItem(flagKey(profileId));
}

export async function testPush(profileId: string): Promise<void> {
  await api.post('/api/push/test', { endpoint: localStorage.getItem(flagKey(profileId)) ?? '' });
}
