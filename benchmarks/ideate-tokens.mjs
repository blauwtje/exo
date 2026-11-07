#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { confinedClaude } from '#confine-claude';
import { UsageError, parseFlags, isMain, environmentMs } from '#script-flags';
import { powerLine } from '../lib/eval-stats.mjs';
import { writeCellUsage } from './cell-usage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'benchmarks/results/ideate-tokens.md');
const QUESTION = 'hoe toon ik voortgang van een lange run';
const MODES = ['full', 'fast'];
const SESSION_MS = environmentMs('EXO_IDEATE_TOKENS_MS', 900_000);
const BUDGET_USD = '5';
const BOOLEAN = 'boolean';
const USAGE = 'usage: ideate-tokens.mjs [--dry-run] [--tier quick|full] [--confirm]; --dry-run prints the planned runs and spends nothing; quick (default) runs one mode, full runs both and writes benchmarks/results/ideate-tokens.md (billed)';
const HEADER = ['| mode | model | input | output | cache read | cache write |', '| --- | --- | ---: | ---: | ---: | ---: |'];

export function plannedModes(tier) {
  if (tier === 'quick') return MODES.slice(0, 1);
  if (tier === 'full') return MODES;
  throw new UsageError(`unknown tier '${tier}'; use quick or full`);
}

export function planLines(tier) {
  const modes = plannedModes(tier);
  const runs = modes.map((mode) => `run: ${promptFor(mode)}`);
  const power = powerLine({ tasks: 1, samples: 1, arms: modes.length });
  return [`tier: ${tier}; n=1 per mode, modes: ${modes.join(', ')}`, ...runs, power];
}

export function promptFor(mode) {
  const suffix = mode === 'fast' ? ' fast' : '';
  return `/exo:ideate ${QUESTION}${suffix}`;
}

function tokenRows(mode, byModel) {
  return Object.entries(byModel).map(([model, counts]) => {
    const cacheWrite = counts.cache5m + counts.cache1h;
    return `| ${mode} | ${model} | ${counts.input} | ${counts.output} | ${counts.cacheRead} | ${cacheWrite} |`;
  });
}

export function tokenTable(byModelPerMode) {
  const rows = Object.entries(byModelPerMode).flatMap(([mode, byModel]) => tokenRows(mode, byModel));
  const lines = ['# Ideate tokens', '', `Question: ${QUESTION}`, '', ...HEADER, ...rows];
  return `${lines.join('\n')}\n`;
}

export function sessionIdOf(stdout) {
  const parsed = JSON.parse(stdout);
  if (typeof parsed.session_id !== 'string') throw new Error('claude result has no session_id');
  return parsed.session_id;
}

function runMode(mode) {
  const cell = fs.mkdtempSync(path.join(os.tmpdir(), `ideate-tokens-${mode}-`));
  const tmp = path.join(cell, 'tmp');
  const workdir = path.join(cell, 'work');
  fs.mkdirSync(tmp);
  fs.mkdirSync(workdir);
  const args = ['-p', promptFor(mode), '--output-format', 'json', '--max-budget-usd', BUDGET_USD, '--plugin-dir', ROOT];
  const run = confinedClaude({ args, roots: [cell], cwd: workdir, tmp });
  const env = { ...process.env, ...run.env };
  const finished = spawnSync(run.command, run.args, { cwd: run.cwd, env, encoding: 'utf8', timeout: SESSION_MS });
  if (finished.status !== 0) throw new Error(`${mode} run failed: ${finished.stderr.trim() || finished.status}`);
  const usage = writeCellUsage(cell, sessionIdOf(finished.stdout));
  if (usage === null) throw new Error(`${mode} run left no transcript`);
  return usage.byModel;
}

function main() {
  const flags = parseFlags(process.argv.slice(2), { confirm: BOOLEAN, 'dry-run': BOOLEAN, tier: 'value' }, { usage: USAGE });
  const tier = flags.tier ?? 'quick';
  const lines = planLines(tier);
  if (flags['dry-run']) {
    process.stdout.write(`${lines.join('\n')}\n`);
    return;
  }
  if (!flags.confirm) throw new UsageError('the runs are billed; re-run with --confirm or use --dry-run');
  process.stdout.write(`${lines.join('\n')}\n`);
  const byModelPerMode = Object.fromEntries(plannedModes(tier).map((mode) => [mode, runMode(mode)]));
  if (tier === 'quick') {
    process.stdout.write(tokenTable(byModelPerMode));
    return;
  }
  fs.writeFileSync(OUT, tokenTable(byModelPerMode));
  process.stdout.write(`wrote ${path.relative(ROOT, OUT)}\n`);
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(error instanceof UsageError ? 2 : 1);
  }
}
