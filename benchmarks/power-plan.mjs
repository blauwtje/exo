import { powerLine } from '../lib/eval-stats.mjs';

export const MIN_RECORDED_TASKS = 2;

export function scoresByTask(rows, { task, score }) {
  const items = {};
  for (const row of rows) {
    const id = task(row);
    const value = score(row);
    if (id === undefined || id === null || typeof value !== 'number') continue;
    (items[id] ??= []).push(value);
  }
  return items;
}

function hasSpread(items) {
  return new Set(Object.values(items).flat()).size > 1;
}

function usableScores(items) {
  if (items === null || items === undefined) return null;
  if (Object.keys(items).length < MIN_RECORDED_TASKS || !hasSpread(items)) return null;
  return { base: items, candidate: items };
}

export function plannedPowerLine({ tasks, samples = 1, arms = 1, recorded = null }) {
  if (!(tasks > 0)) return 'power: no task planned';
  const scores = usableScores(recorded);
  const design = scores === null ? {} : { scores };
  return powerLine({ tasks, samples: Math.max(1, samples), arms: Math.max(1, arms), ...design });
}
