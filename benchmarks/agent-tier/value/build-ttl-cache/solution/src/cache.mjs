export function createCache({ ttlMs = Infinity, now = Date.now } = {}) {
  const entries = new Map();

  function live(key) {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (now() - entry.storedAt >= ttlMs) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    get: (key) => live(key)?.value,
    has: (key) => live(key) !== undefined,
    set(key, value) {
      entries.set(key, { value, storedAt: now() });
    },
    delete: (key) => entries.delete(key),
    get size() {
      for (const key of [...entries.keys()]) live(key);
      return entries.size;
    },
  };
}
