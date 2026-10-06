export function memoize(fn, keyOf = (arg) => arg) {
  const cache = new Map();
  return (...args) => {
    const key = keyOf(...args);
    if (!cache.has(key)) cache.set(key, fn(...args));
    return cache.get(key);
  };
}
