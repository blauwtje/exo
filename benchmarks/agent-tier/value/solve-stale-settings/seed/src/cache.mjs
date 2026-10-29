export function createCache() {
  const entries = new Map();
  return {
    get: (key) => entries.get(key),
    set: (key, value) => entries.set(key, value),
    delete: (key) => entries.delete(key),
    has: (key) => entries.has(key)
  };
}
