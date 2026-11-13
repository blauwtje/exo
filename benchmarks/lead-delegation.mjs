#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { confineRefusal } from '#confine-claude';
import { UsageError, parseFlags, isMain } from '#script-flags';
import { powerLine } from '../lib/eval-stats.mjs';
import { isExoPath } from '../lib/live-shells.mjs';
import { makeCellHome } from './cell-home.mjs';
import { runSession } from './lead-delegation-session.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUICK_CELLS = 'claude-fable-5-2:medium';
const FULL_CELLS = 'claude-fable-5-2:medium,claude-fable-5-2:high,claude-opus-5-5:medium,claude-opus-5-5:high';
const QUICK_RUNS = 1;
const FULL_RUNS = 3;
const SESSION_BUDGET_USD = 2;
const TOTAL_BUDGET_USD = 3;
const MAX_WRITES = 2;
const AGENT_TOOLS = new Set(['Agent', 'Task']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const DESIGN_REFERENCE = 'design-ui.md';
const USAGE = `usage: lead-delegation.mjs [--full] [--dry-run] [--cells <model:effort,...>] [--runs <n>] [--plugin-dir <checkout>] [--max-budget-usd <usd per session>] [--max-total-usd <usd>] [--out <dir>] [--score <stream.jsonl>]
Default: cell ${QUICK_CELLS}, ${QUICK_RUNS} run. --full: claude-fable-5-2 and claude-opus-5-5 at medium and high, ${FULL_RUNS} runs each.
A run passes when the lead starts at least one subagent and writes at most ${MAX_WRITES} product files itself. A run with a permission denial is VOID. Exit 0 when every non-void run passes, 1 otherwise, 2 bad flag.`;
const SPEC = { full: 'boolean', 'dry-run': 'boolean', cells: 'string', runs: 'string', 'plugin-dir': 'string', 'max-budget-usd': 'string', 'max-total-usd': 'string', out: 'string', score: 'string' };

function parseStream(text) {
  return text.split('\n').filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function leadBlocks(events, type) {
  return events
    .filter((event) => event.type === type && !event.parent_tool_use_id)
    .flatMap((event) => event.message?.content ?? []);
}

function isProductFile(file) {
  return !isExoPath(file) && !file.split('/').includes('.claude');
}

export function scoreStream(events) {
  const calls = leadBlocks(events, 'assistant').filter((block) => block.type === 'tool_use');
  const written = calls
    .filter((call) => WRITE_TOOLS.has(call.name))
    .map((call) => call.input?.file_path ?? call.input?.notebook_path)
    .filter((file) => typeof file === 'string' && isProductFile(file));
  const designReads = calls.filter((call) => call.name === 'Read' && String(call.input?.file_path).endsWith(DESIGN_REFERENCE));
  const failedIds = new Set(leadBlocks(events, 'user').filter((block) => block.type === 'tool_result' && block.is_error).map((block) => block.tool_use_id));
  const result = events.find((event) => event.type === 'result');
  const agents = calls.filter((call) => AGENT_TOOLS.has(call.name)).length;
  const writes = new Set(written).size;
  return {
    agents,
    writes,
    readDesignUi: designReads.some((call) => !failedIds.has(call.id)),
    denials: result?.permission_denials?.length ?? 0,
    cost: result?.total_cost_usd ?? 0,
    capped: result?.subtype === 'error_max_budget_usd',
    pass: agents >= 1 && writes <= MAX_WRITES
  };
}

function verdictOf(score) {
  if (score.denials > 0) return 'VOID';
  const verdict = score.pass ? 'PASS' : 'FAIL';
  return score.capped ? `${verdict} CAPPED` : verdict;
}

function runLine({ cell, run, score, stream }) {
  return [cell, run, verdictOf(score), score.agents, score.writes, score.readDesignUi, score.denials, score.cost.toFixed(4), stream].join(' ');
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
    out: flags.out
  };
}

function dryRun(plan) {
  const sessions = plan.cells.length * plan.runs;
  const projected = Math.min(sessions * plan.budget, plan.total);
  process.stdout.write(`cells: ${plan.cells.join(', ')}; runs per cell: ${plan.runs}; sessions: ${sessions}\n`);
  process.stdout.write(`projected cost: at most $${projected.toFixed(2)} (${sessions} x $${plan.budget} per session, stopping at $${plan.total} total)\n`);
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
      await runSession({ cell, budget: plan.budget, pluginDir: plan.pluginDir, stream, home });
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
    const counted = scores.filter((score) => score.denials === 0);
    process.stdout.write(`${cell} ${counted.filter((score) => score.pass).length}/${counted.length}\n`);
  }
  const counted = Object.values(verdicts).flat().filter((score) => score.denials === 0);
  return counted.every((score) => score.pass) ? 0 : 1;
}

function scoreExisting(file) {
  const score = scoreStream(parseStream(fs.readFileSync(file, 'utf8')));
  process.stdout.write(`${runLine({ cell: 'existing', run: 1, score, stream: file })}\n`);
  return score.denials > 0 || !score.pass ? 1 : 0;
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
