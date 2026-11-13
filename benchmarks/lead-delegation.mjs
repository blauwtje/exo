#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { confineRefusal } from '#confine-claude';
import { UsageError, parseFlags, isMain } from '#script-flags';
import { powerLine } from '../lib/eval-stats.mjs';
import { makeCellHome } from './cell-home.mjs';
import { runSession } from './lead-delegation-session.mjs';
import { referenceFiles } from './lead-delegation-reference.mjs';
import { CONTEXT_FLOOR, MAX_WRITES, parseStream, scoreStream, verdictOf } from './lead-delegation-turns.mjs';

export { scoreStream };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUICK_CELLS = 'claude-fable-5-2:medium';
const FULL_CELLS = 'claude-fable-5-2:medium,claude-fable-5-2:high,claude-opus-5-5:medium,claude-opus-5-5:high';
const QUICK_RUNS = 1;
const FULL_RUNS = 3;
const CHARACTERS_PER_TOKEN = 2.2;
const SESSION_BUDGET_USD = 2;
const TOTAL_BUDGET_USD = 3;
const USAGE = `usage: lead-delegation.mjs [--full] [--dry-run] [--cells <model:effort,...>] [--runs <n>] [--plugin-dir <checkout>] [--max-budget-usd <usd per session>] [--max-total-usd <usd>] [--out <dir>] [--history] [--score <stream.jsonl>]
Default: cell ${QUICK_CELLS}, ${QUICK_RUNS} run. --full: claude-fable-5-2 and claude-opus-5-5 at medium and high, ${FULL_RUNS} runs each.
A run passes when the lead starts at least one subagent and writes at most ${MAX_WRITES} product files itself. --history: one session, two turns; turn 1 explores and decides the design with no writes, turn 2 asks for the build, and only turn 2 is scored. A run with a permission denial, a product file written in turn 1, or a build turn that starts under ${CONTEXT_FLOOR} context tokens is VOID. Exit 0 when every non-void run passes, 1 otherwise, 2 bad flag.`;
const SPEC = { full: 'boolean', 'dry-run': 'boolean', cells: 'string', runs: 'string', 'plugin-dir': 'string', 'max-budget-usd': 'string', 'max-total-usd': 'string', out: 'string', score: 'string', history: 'boolean' };

function runLine({ cell, run, score, stream }) {
  return [cell, run, verdictOf(score), score.agents, score.writes, score.readDesignUi, score.denials, score.cost.toFixed(4), score.context ?? '-', stream].join(' ');
}

function positiveNumber(value, name) {
  const number = Number(value);
  if (!(number > 0)) throw new UsageError(`${name} needs a positive number`);
  return number;
}

function planFrom(flags) {
  const full = Boolean(flags.full);
  const cells = (flags.cells ?? (full ? FULL_CELLS : QUICK_CELLS)).split(',');
  for (const cell of cells) {
    if (!/^[^:]+:[^:]+$/.test(cell)) throw new UsageError(`bad cell '${cell}'; use model:effort`);
  }
  const runs = Number(flags.runs ?? (full ? FULL_RUNS : QUICK_RUNS));
  if (!Number.isInteger(runs) || runs < 1) throw new UsageError('--runs needs a positive integer');
  return {
    cells,
    runs,
    pluginDir: path.resolve(flags['plugin-dir'] ?? ROOT),
    budget: positiveNumber(flags['max-budget-usd'] ?? SESSION_BUDGET_USD, '--max-budget-usd'),
    total: positiveNumber(flags['max-total-usd'] ?? TOTAL_BUDGET_USD, '--max-total-usd'),
    out: flags.out,
    history: Boolean(flags.history)
  };
}

function referenceLine() {
  const files = referenceFiles();
  const characters = files.reduce((sum, file) => sum + file.text.length, 0);
  return `reference files: ${files.length}; characters: ${characters}; estimated tokens: ${Math.round(characters / CHARACTERS_PER_TOKEN)}; VOID floor: ${CONTEXT_FLOOR} context tokens`;
}

function dryRun(plan) {
  const sessions = plan.cells.length * plan.runs;
  const projected = Math.min(sessions * plan.budget, plan.total);
  process.stdout.write(`cells: ${plan.cells.join(', ')}; runs per cell: ${plan.runs}; sessions: ${sessions}\n`);
  process.stdout.write(`projected cost: at most $${projected.toFixed(2)} (${sessions} x $${plan.budget} per session, stopping at $${plan.total} total)\n`);
  if (plan.history) process.stdout.write(`each session has two turns\n${referenceLine()}\n`);
  process.stdout.write(`${powerLine({ tasks: 1, samples: plan.runs, arms: plan.cells.length })}\n`);
}

async function measure(plan) {
  const refusal = confineRefusal();
  if (refusal) throw new UsageError(refusal);
  const out = plan.out ?? fs.mkdtempSync(path.join(os.tmpdir(), 'exo-lead-delegation-out-'));
  fs.mkdirSync(out, { recursive: true });
  const home = makeCellHome();
  const verdicts = {};
  let spent = 0;
  for (const cell of plan.cells) {
    verdicts[cell] = [];
    for (let run = 1; run <= plan.runs && spent < plan.total; run += 1) {
      const stream = path.join(out, `${cell.replace(/[^\w.-]/g, '_')}-${run}.jsonl`);
      await runSession({ cell, budget: plan.budget, pluginDir: plan.pluginDir, stream, home, history: plan.history });
      const score = scoreStream(parseStream(fs.readFileSync(stream, 'utf8')));
      spent += score.cost;
      verdicts[cell].push(score);
      process.stdout.write(`${runLine({ cell, run, score, stream })}\n`);
    }
  }
  return verdicts;
}

function summarize(verdicts) {
  for (const [cell, scores] of Object.entries(verdicts)) {
    const counted = scores.filter((score) => !score.void);
    process.stdout.write(`${cell} ${counted.filter((score) => score.pass).length}/${counted.length}\n`);
  }
  const counted = Object.values(verdicts).flat().filter((score) => !score.void);
  return counted.every((score) => score.pass) ? 0 : 1;
}

function scoreExisting(file) {
  const score = scoreStream(parseStream(fs.readFileSync(file, 'utf8')));
  process.stdout.write(`${runLine({ cell: 'existing', run: 1, score, stream: file })}\n`);
  return score.void || !score.pass ? 1 : 0;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2), SPEC, { usage: USAGE });
  if (flags.score) return scoreExisting(flags.score);
  const plan = planFrom(flags);
  if (flags['dry-run']) return dryRun(plan) ?? 0;
  return summarize(await measure(plan));
}

if (isMain(import.meta.url)) {
  main().then((code) => process.exit(code), (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(error instanceof UsageError ? 2 : 1);
  });
}
