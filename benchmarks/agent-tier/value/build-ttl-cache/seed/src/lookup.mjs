export function cachedLookup(cache, key, load) {
  if (cache.has(key)) return cache.get(key);
  const value = load(key);
  cache.set(key, value);
  return value;
}
