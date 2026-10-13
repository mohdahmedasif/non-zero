// Lets the lock screen check a PIN with no connection. After each successful
// server unlock a salted PBKDF2 hash of the PIN is kept on this device. It only
// gates the cached copy of the data; the server always re-checks the PIN itself.

const storageKey = (profileId: string) => `nz.pin.${profileId}`;
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map((b) => parseInt(b, 16)));

async function derive(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: 300_000 },
    key,
    256,
  );
  return hex(new Uint8Array(bits));
}

export async function rememberPin(profileId: string, pin: string): Promise<void> {
  if (!globalThis.crypto?.subtle) return;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(storageKey(profileId), JSON.stringify({ salt: hex(salt), hash: await derive(pin, salt) }));
}

export function forgetPin(profileId: string): void {
  localStorage.removeItem(storageKey(profileId));
}

/** True or false when the PIN can be checked on this device, null when it cannot. */
export async function checkPinOffline(profileId: string, pin: string): Promise<boolean | null> {
  const stored = localStorage.getItem(storageKey(profileId));
  if (!stored || !globalThis.crypto?.subtle) return null;
  const { salt, hash } = JSON.parse(stored) as { salt: string; hash: string };
  return (await derive(pin, unhex(salt))) === hash;
}
