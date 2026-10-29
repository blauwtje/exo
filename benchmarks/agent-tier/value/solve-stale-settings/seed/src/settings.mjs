import { createCache } from './cache.mjs';

export function createSettings(db) {
  const cache = createCache();

  function getSettings(id) {
    const key = String(id);
    if (cache.has(key)) return cache.get(key);
    const row = db.read(id);
    if (row) cache.set(key, row);
    return row;
  }

  function updateSettings(id, patch) {
    db.write(id, patch);
    cache.delete(id);
    return getSettings(id);
  }

  function updateMany(ids, patch) {
    return ids.map((id) => updateSettings(id, patch));
  }

  function deleteUser(id) {
    db.remove(id);
  }

  return { getSettings, updateSettings, updateMany, deleteUser };
}
