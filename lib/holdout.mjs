import crypto from 'node:crypto';
import { mean, pairedDiff } from './eval-stats.mjs';

const rank = (id) => crypto.createHash('sha256').update(id).digest('hex');

export function splitIds(ids, share) {
  const ordered = [...new Set(ids)].sort((a, b) => rank(a).localeCompare(rank(b)) || a.localeCompare(b));
  const count = Math.round(ordered.length * share);
  return { held: ordered.slice(0, count).sort(), tune: ordered.slice(count).sort() };
}

export function planHoldout(ids, { holdoutMin, holdoutShare }) {
  const unique = [...new Set(ids)];
  if (unique.length < holdoutMin) return null;
  const { held, tune } = splitIds(unique, holdoutShare);
  if (held.length === 0 || tune.length < 2) return null;
  return { held, cases: unique.length };
}

export function splitItems(items, held) {
  const parts = { tune: {}, held: {} };
  const heldIds = new Set(held);
  for (const [id, value] of Object.entries(items)) parts[heldIds.has(id) ? 'held' : 'tune'][id] = value;
  return parts;
}

export const itemsMean = (items) => {
  const means = Object.values(items).filter((values) => values.length > 0).map(mean);
  return means.length === 0 ? null : mean(means);
};

export function heldOutDiff(base, candidate, { z, sign = 1 }) {
  const ids = Object.keys(candidate ?? {}).filter((id) => base?.[id]?.length > 0 && candidate[id].length > 0).sort();
  if (ids.length === 0) return null;
  const pairs = ids.map((id) => [sign * mean(base[id]), sign * mean(candidate[id])]);
  return { ...pairedDiff(pairs, z), cases: ids.length };
}

export const clearlyWorse = (check) => check !== null && check.hi !== null && check.hi < 0;
