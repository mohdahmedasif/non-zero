import type { Entry, Habit, HabitInput, Profile } from '@non-zero/shared';
import { today } from '@non-zero/shared';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, set } from 'idb-keyval';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { session } from '../session';
import { ApiError, api } from './client';
import { enqueue, flush, withPending } from './outbox';

export const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: CACHE_MAX_AGE_MS,
      retry: (failures, err) => !(err instanceof ApiError) && failures < 2,
    },
  },
});

// Keeps the last server data in IndexedDB so the app opens offline.
export const persister = createAsyncStoragePersister({
  storage: { getItem: (k) => get<string>(k), setItem: (k, v) => set(k, v), removeItem: (k) => del(k) },
  key: 'nz.cache',
});

function useProfileId(): string {
  return session.use().profile!.id;
}

export function useProfiles() {
  return useQuery({ queryKey: ['profiles'], queryFn: () => api.get<Profile[]>('/api/profiles') });
}

export function useHabits() {
  const profileId = useProfileId();
  return useQuery({ queryKey: ['habits', profileId], queryFn: () => api.get<Habit[]>('/api/habits') });
}

export function useEntries() {
  const profileId = useProfileId();
  return useQuery({
    queryKey: ['entries', profileId],
    queryFn: async () => {
      await flush(profileId);
      return withPending(profileId, await api.get<Entry[]>('/api/entries'));
    },
  });
}

/** habit id → day → value */
export type Values = Map<string, Map<string, number>>;
const NO_VALUES: ReadonlyMap<string, number> = new Map();
export const valuesOf = (values: Values, habitId: string) => values.get(habitId) ?? NO_VALUES;

export function useValues(): Values {
  const { data } = useEntries();
  return useMemo(() => {
    const values: Values = new Map();
    for (const e of data ?? []) {
      let days = values.get(e.habitId);
      if (!days) values.set(e.habitId, (days = new Map()));
      days.set(e.date, e.value);
    }
    return values;
  }, [data]);
}

/** Records a value for a habit on a day: shown at once, queued, then synced. */
export function useSetEntry() {
  const profileId = useProfileId();
  const client = useQueryClient();
  return useCallback(
    (habitId: string, date: string, value: number) => {
      const entry: Entry = { habitId, date, value, updatedAt: Date.now() };
      client.setQueryData<Entry[]>(['entries', profileId], (old = []) => [
        ...old.filter((e) => e.habitId !== habitId || e.date !== date),
        entry,
      ]);
      enqueue(profileId, entry)
        .then(() => flush(profileId))
        .catch(() => {});
    },
    [client, profileId],
  );
}

/** Retries queued changes whenever the connection or the app comes back. */
export function useOutboxSync(): void {
  const profileId = useProfileId();
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState === 'visible') flush(profileId).catch(() => {});
    };
    sync();
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('online', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [profileId]);
}

export function useSaveHabit() {
  const profileId = useProfileId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<HabitInput> & { id?: string; archived?: boolean }) =>
      id ? api.patch<Habit>(`/api/habits/${id}`, patch) : api.post<Habit>('/api/habits', patch),
    onSuccess: () => client.invalidateQueries({ queryKey: ['habits', profileId] }),
  });
}

export function useDeleteHabit() {
  const profileId = useProfileId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/habits/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['habits', profileId] }),
  });
}

/** Today's date, kept current across midnight and after the app was in the background. */
export function useToday(): string {
  const [day, setDay] = useState(today);
  useEffect(() => {
    const refresh = () => setDay(today());
    const timer = setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return day;
}
