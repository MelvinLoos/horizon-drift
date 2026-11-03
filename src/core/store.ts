/** Minimal typed observable store: one-way data flow (actions in, subscriptions out). */

export type Listener<S> = (state: S, previous: S) => void;

export interface Store<S> {
  get(): S;
  /** Shallow-merges `patch`; listeners run only if a value actually changed. */
  set(patch: Partial<S>): void;
  /** Returns an unsubscribe function. */
  subscribe(listener: Listener<S>): () => void;
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<Listener<S>>();
  return {
    get: () => state,
    set(patch) {
      const keys = Object.keys(patch) as (keyof S)[];
      if (keys.every((k) => Object.is(state[k], patch[k]))) return;
      const previous = state;
      state = { ...state, ...patch };
      for (const listener of [...listeners]) listener(state, previous);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
