import { useSyncExternalStore } from 'react';

/** A value React components can subscribe to and plain modules can update. */
export function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  const get = () => state;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };
  return {
    get,
    set(next: T) {
      if (Object.is(next, state)) return;
      state = next;
      listeners.forEach((l) => l());
    },
    use: () => useSyncExternalStore(subscribe, get),
  };
}
