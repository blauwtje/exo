#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';
import { UsageError, parseFlags, isMain } from '#script-flags';

const Z95 = 1.96;
const NULL_KEY = 'null';
const USAGE = `usage: routing-stats.mjs --in <routing result json> [--cell <model:effort>] [--arm hook|no-hook] [--split train|held-out] [--json]
Prints, per expected skill, recall pooled over every session, its min-max across runs and a Wilson 95% interval;
for prompts that expect no skill, the false-positive rate: the share of sessions that picked any skill. Spends nothing.
Defaults: cell sonnet:low, arm hook, every split.`;

export function wilson(hits, trials, z = Z95) {
  if (trials === 0) return null;
  const rate = hits / trials;
  const scale = 1 + z ** 2 / trials;
  const centre = (rate + z ** 2 / (2 * trials)) / scale;
  const half = (z * Math.sqrt(rate * (1 - rate) / trials + z ** 2 / (4 * trials ** 2))) / scale;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

const isPositive = (session) => (session.expect === null ? session.pick !== null : session.pick === session.expect);

function describe(sessions) {
  const runs = [...new Set(sessions.map((session) => session.run))].sort((a, b) => a - b);
  const perRun = runs.map((run) => {
    const inRun = sessions.filter((session) => session.run === run);
    return inRun.filter(isPositive).length / inRun.length;
  });
  const hits = sessions.filter(isPositive).length;
  return {
    prompts: new Set(sessions.map((session) => session.prompt)).size,
    trials: sessions.length,
    rate: hits / sessions.length,
    perRun,
    min: Math.min(...perRun),
    max: Math.max(...perRun),
    ci95: wilson(hits, sessions.length)
  };
}

export function routingStats(sessions, { cell = 'sonnet:low', arm = 'hook', split } = {}) {
  const kept = sessions.filter((session) => session.error === undefined && session.cell === cell && session.arm === arm && (!split || session.split === split));
  const groups = {};
  for (const session of kept) {
    const key = session.expect ?? NULL_KEY;
    (groups[key] ??= []).push(session);
  }
  const table = {};
  for (const key of Object.keys(groups).sort()) table[key] = { measure: key === NULL_KEY ? 'falsePositive' : 'recall', ...describe(groups[key]) };
  return table;
}

const fixed = (value) => value.toFixed(3);

export function statsLines(table) {
  return Object.entries(table).map(([key, row]) => `${key.padEnd(13)} ${row.measure.padEnd(13)} ${fixed(row.rate)} runs ${fixed(row.min)}-${fixed(row.max)} ci95 ${fixed(row.ci95[0])}-${fixed(row.ci95[1])} prompts ${row.prompts} trials ${row.trials}`);
}

function main() {
  const flags = parseFlags(process.argv.slice(2), { in: 'value', cell: 'value', arm: 'value', split: 'value', json: 'boolean' }, { usage: USAGE });
  if (!flags.in) throw new UsageError('--in is required');
  if (flags.split !== undefined && !['train', 'held-out'].includes(flags.split)) throw new UsageError('--split must be train or held-out');
  const { sessions = [] } = JSON.parse(fs.readFileSync(flags.in, 'utf8'));
  const table = routingStats(sessions, { cell: flags.cell, arm: flags.arm, split: flags.split });
  process.stdout.write(flags.json ? `${JSON.stringify(table, null, 2)}\n` : `${statsLines(table).join('\n')}\n`);
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(error instanceof UsageError ? 2 : 1);
  }
}
