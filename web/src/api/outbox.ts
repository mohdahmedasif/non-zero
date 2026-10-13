import type { Entry } from '@non-zero/shared';
import { get, set } from 'idb-keyval';
import { createStore } from '../lib/store';
import { ApiError, api } from './client';

// Entry writes are saved here first and sent when the server is reachable, so
// ticking a habit works offline and survives closing the app.

type Box = Record<string, Entry>;

const boxKey = (profileId: string) => `outbox:${profileId}`;
const entryKey = (e: Pick<Entry, 'habitId' | 'date'>) => `${e.habitId}|${e.date}`;

/** Number of entry changes not yet on the server. */
export const pendingCount = createStore(0);

// IndexedDB reads and writes of the box run one at a time.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const result = chain.then(task, task);
  chain = result.catch(() => {});
  return result;
}

const read = async (profileId: string): Promise<Box> => (await get<Box>(boxKey(profileId))) ?? {};
const write = async (profileId: string, box: Box) => {
  await set(boxKey(profileId), box);
  pendingCount.set(Object.keys(box).length);
};

export function enqueue(profileId: string, entry: Entry): Promise<void> {
  return serial(async () => {
    const box = await read(profileId);
    box[entryKey(entry)] = entry;
    await write(profileId, box);
  });
}

/** Sends everything queued. Rejects, leaving the queue intact, when the server is unreachable. */
export async function flush(profileId: string): Promise<void> {
  const sent = Object.values(await serial(() => read(profileId)));
  pendingCount.set(sent.length);
  if (!sent.length) return;
  try {
    await api.put('/api/entries', { entries: sent });
  } catch (err) {
    // A batch the server will never accept must not block the queue forever.
    const rejected = err instanceof ApiError && err.status === 400;
    if (!rejected) throw err;
  }
  await serial(async () => {
    const box = await read(profileId);
    for (const e of sent) {
      // Keep anything changed again while the request was in flight.
      if (box[entryKey(e)]?.updatedAt === e.updatedAt) delete box[entryKey(e)];
    }
    await write(profileId, box);
  });
}

/** Server entries with still-queued local changes applied on top. */
export async function withPending(profileId: string, server: Entry[]): Promise<Entry[]> {
  const box = await serial(() => read(profileId));
  const merged = new Map(server.map((e) => [entryKey(e), e]));
  for (const e of Object.values(box)) {
    const existing = merged.get(entryKey(e));
    if (!existing || existing.updatedAt < e.updatedAt) merged.set(entryKey(e), e);
  }
  return [...merged.values()];
}
