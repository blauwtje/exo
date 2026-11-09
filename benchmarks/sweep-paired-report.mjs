import { pairedDiff } from '../lib/eval-stats.mjs';

const METRICS = [
  ['tokens', (record) => record.tokens],
  ['cost USD', (record) => record.costUsd],
  ['hidden-check pass', (record) => (typeof record.hiddenPass === 'boolean' ? Number(record.hiddenPass) : null)],
  ['wall ms', (record) => record.wallMs]
];

const pairKey = (record) => `${record.id}\u0000${record.repeat ?? 0}`;

function armsByKey(records) {
  const arms = new Map();
  for (const record of records) {
    if (record.arm !== 'base' && record.arm !== 'cand') continue;
    const entry = arms.get(pairKey(record)) ?? {};
    entry[record.arm] = record;
    arms.set(pairKey(record), entry);
  }
  return [...arms.values()].filter((entry) => entry.base && entry.cand);
}

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

function metricLine({ name, read, pairs }) {
  const values = pairs.map(({ base, cand }) => [read(base), read(cand)]).filter((pair) => pair.every(isNumber));
  if (values.length === 0) return `- ${name}: no pair with both values`;
  const { mean, lo, hi, n } = pairedDiff(values);
  if (lo === null) return `- ${name}: cand minus base ${mean.toFixed(4)} (n=${n}, no interval)`;
  return `- ${name}: cand minus base ${mean.toFixed(4)}, 95% CI ${lo.toFixed(4)} to ${hi.toFixed(4)} (n=${n})`;
}

export function pairedSection(records) {
  const pairs = armsByKey(records);
  if (pairs.length === 0) return '';
  const lines = METRICS.map(([name, read]) => metricLine({ name, read, pairs }));
  return ['## Paired', '', `${pairs.length} pairs`, '', ...lines, ''].join('\n');
}
