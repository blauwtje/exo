// Read-through cache with a time-to-live. Values are copied in and out, so a
// caller can never change a cached entry by editing what it got back.
export function createCache({ ttlMs = 5 * 60 * 1000, now = () => Date.now() } = {}) {
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expires <= now()) {
        entries.delete(key);
        return undefined;
      }
      return structuredClone(entry.value);
    },
    set(key, value) {
      entries.set(key, { value: structuredClone(value), expires: now() + ttlMs });
    },
    delete: (key) => entries.delete(key),
    deletePrefix(prefix) {
      for (const key of [...entries.keys()]) {
        if (key.startsWith(prefix)) entries.delete(key);
      }
    },
    keys: () => [...entries.keys()],
  };
}
