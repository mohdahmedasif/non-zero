import type { Profile } from '@non-zero/shared';
import { OfflineError, api, setUnauthorizedHandler, setUnpairedHandler } from './api/client';
import { checkPinOffline, forgetPin, rememberPin } from './lib/pinVerifier';
import { createStore } from './lib/store';

const PROFILE_KEY = 'nz.profile';
const ACTIVE_KEY = 'nz.lastActive';
/** Time in the background after which the PIN is asked for again. */
export const LOCK_AFTER_MS = 5 * 60_000;

export interface Session {
  /** Profile this device is on, or null while on the profile picker. */
  profile: Profile | null;
  locked: boolean;
}

function initial(): Session {
  const stored = localStorage.getItem(PROFILE_KEY);
  const profile = stored ? (JSON.parse(stored) as Profile) : null;
  const lastActive = Number(localStorage.getItem(ACTIVE_KEY)) || 0;
  return { profile, locked: profile !== null && Date.now() - lastActive > LOCK_AFTER_MS };
}

export const session = createStore<Session>(initial());

/** False once the server has refused this browser as not paired. */
export const paired = createStore(true);

export async function pairDevice(adminKey: string): Promise<void> {
  await api.post('/api/device/pair', { adminKey });
  paired.set(true);
}

/** Signs out and removes this browser's pairing, so it needs the admin key again. */
export async function unpairDevice(): Promise<void> {
  await api.post('/api/device/unpair');
  setProfile(null, false);
  paired.set(false);
}

function setProfile(profile: Profile | null, locked: boolean): void {
  if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  else localStorage.removeItem(PROFILE_KEY);
  session.set({ profile, locked });
}

const touch = () => localStorage.setItem(ACTIVE_KEY, String(Date.now()));

export function lock(): void {
  const { profile } = session.get();
  if (profile) session.set({ profile, locked: true });
}

/**
 * Unlocks a profile with its PIN. The server decides when it can be reached;
 * with no connection, a profile already used on this device can be opened
 * against the locally remembered PIN to view and queue changes.
 */
export async function unlock(profile: Profile, pin: string): Promise<void> {
  try {
    const fresh = await api.post<Profile>('/api/auth/unlock', { profileId: profile.id, pin });
    await rememberPin(profile.id, pin);
    touch();
    setProfile(fresh, false);
  } catch (err) {
    if (!(err instanceof OfflineError)) throw err;
    const ok = await checkPinOffline(profile.id, pin);
    if (ok === null) throw err;
    if (!ok) throw new Error('Wrong PIN');
    touch();
    setProfile(profile, false);
  }
}

/** Ends the server session and returns to the profile picker. */
export async function switchProfile(): Promise<void> {
  await api.post('/api/auth/lock').catch(() => {});
  setProfile(null, false);
}

export function updateProfile(profile: Profile): void {
  setProfile(profile, false);
}

export function profileRemoved(profileId: string): void {
  forgetPin(profileId);
  setProfile(null, false);
}

setUnauthorizedHandler(lock);
setUnpairedHandler(() => paired.set(false));

document.addEventListener('visibilitychange', () => {
  const { profile, locked } = session.get();
  if (!profile || locked) return;
  if (document.visibilityState === 'hidden') return touch();
  const lastActive = Number(localStorage.getItem(ACTIVE_KEY)) || 0;
  if (Date.now() - lastActive > LOCK_AFTER_MS) lock();
  else touch();
});
// Covers the app being closed without ever being hidden first.
window.addEventListener('pagehide', () => {
  const { profile, locked } = session.get();
  if (profile && !locked) touch();
});
