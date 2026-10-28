#!/usr/bin/env node

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { confineRefusal, confinedClaude } from '#confine-claude';
import { makeDefaultOptionsHome } from '#default-options-home';
import { usageCounts } from '#token-weights';
import { UsageError, parseFlags, isMain, environmentMs } from '#script-flags';
import { makeRunFolder, withHome } from '../skills/edit-skills/scripts/pressure.mjs';
import { countsCost } from './pricing.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SESSION_MS = environmentMs('EXO_ROUTING_SESSION_MS', 120_000);
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const CELL_PATTERN = /^[^:]+:[^:]+$/;
const ARM_SETTINGS = { hook: undefined, 'no-hook': { disableAllHooks: true } };
const STDERR_TAIL = 500;
const SMOKE_SKILL = 'build';
const RESULTS = path.join(ROOT, 'benchmarks/results');
const BASELINE_FILE = path.join(RESULTS, 'routing-baseline.json');
const QUICK_FILE = path.join(RESULTS, 'routing-quick.json');
const FULL_FILE = path.join(RESULTS, 'routing.json');
const TIER_DEFAULTS = {
  full: { arms: 'hook,no-hook', out: FULL_FILE },
  baseline: { arms: 'no-hook', out: BASELINE_FILE },
  quick: { arms: 'hook', out: QUICK_FILE }
};
const QUICK_PER_SKILL = 1;
const QUICK_PER_NULL = 4;
const USAGE = `usage: routing.mjs [--full] [--write-baseline] [--cells <model:effort,...>] [--runs <n>] [--arms hook,no-hook] [--split train|held-out] [--concurrency <n>] [--smoke] [--dry-run] [--out <file>]
Default: a fixed quick set of held-out prompts of benchmarks/routing/prompts.json, one run, the hook arm live against the no-hook arm stored in benchmarks/results/routing-baseline.json, written to benchmarks/results/routing-quick.json. A baseline whose cells, prompts or description hashes differ prints 'baseline stale' and runs the no-hook arm live too.
--write-baseline runs the no-hook arm on the quick set and stores it as the baseline. --full runs every prompt, 3 runs, both arms, and writes benchmarks/results/routing.json; --split needs --full.
--smoke runs one known-good prompt and exits 1 on a miss. --dry-run spends nothing and prints the session count times the median cost_usd recorded in --out. Defaults: cell sonnet:low, --concurrency 4.`;

function descriptionOf(text) {
  const front = text.split('\n---')[0];
  const match = /^description: (.+)$/m.exec(front);
  return { text: match ? match[1] : '', invocable: !/^disable-model-invocation: true$/m.test(front) };
}

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

export function modelInvocableSkills(root) {
  return fs.readdirSync(path.join(root, 'skills')).sort().filter((name) => {
    const file = path.join(root, 'skills', name, 'SKILL.md');
    return fs.existsSync(file) && descriptionOf(fs.readFileSync(file, 'utf8')).invocable;
  });
}

export function descriptionHashes(root) {
  const hashes = {};
  for (const name of modelInvocableSkills(root)) {
    hashes[name] = sha256(descriptionOf(fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf8')).text);
  }
  hashes['session-routing'] = sha256(fs.readFileSync(path.join(root, 'hooks', 'session-routing.md'), 'utf8'));
  return hashes;
}

export function pickOfLine(line) {
  let event;
  try { event = JSON.parse(line); } catch { return undefined; }
  if (event?.type !== 'assistant' || !Array.isArray(event.message?.content)) return undefined;
  const use = event.message.content.find((block) => block?.type === 'tool_use');
  if (!use) return undefined;
  if (use.name !== 'Skill' || typeof use.input?.skill !== 'string') return null;
  return use.input.skill.replace(/^exo:/, '');
}

export function costOfLine(line) {
  const message = JSON.parse(line).message;
  return message.usage ? countsCost(usageCounts(message.usage), message.model) : null;
}

export function quickPrompts(all) {
  const heldOut = all.filter((entry) => entry.split === 'held-out');
  const keys = [...new Set(heldOut.map((entry) => entry.expect))];
  return keys.flatMap((key) => heldOut.filter((entry) => entry.expect === key).slice(0, key === null ? QUICK_PER_NULL : QUICK_PER_SKILL));
}

export function baselineProblem(baseline, current) {
  if (!baseline) return 'missing';
  for (const key of ['cells', 'prompts', 'hashes']) {
    if (!isDeepStrictEqual(baseline[key], current[key])) return `${key} differ`;
  }
  return null;
}

export function withBaseline(outcome, baseline) {
  const results = {};
  const errors = {};
  for (const cell of outcome.cells) {
    results[cell] = { ...outcome.results[cell], 'no-hook': baseline.results[cell]['no-hook'] };
    errors[cell] = { ...outcome.errors[cell], 'no-hook': baseline.errors[cell]['no-hook'] };
  }
  return { ...outcome, arms: [...outcome.arms, 'no-hook'], results, errors, sessions: [...outcome.sessions, ...baseline.sessions] };
}

export function medianCost(sessions) {
  const costs = sessions.map((session) => session.cost_usd).filter((cost) => typeof cost === 'number').sort((a, b) => a - b);
  if (costs.length === 0) return null;
  const middle = Math.floor(costs.length / 2);
  return costs.length % 2 ? costs[middle] : (costs[middle - 1] + costs[middle]) / 2;
}

export function dryRunLine(sessionCount, recorded) {
  const median = medianCost(recorded);
  if (median === null) return `dry-run: ${sessionCount} sessions, cost unknown`;
  return `dry-run: ${sessionCount} sessions x median $${median.toFixed(4)} = $${(sessionCount * median).toFixed(2)}`;
}

export function gradeStream(text) {
  for (const line of text.split('\n')) {
    const pick = pickOfLine(line);
    if (pick !== undefined) return pick;
  }
  return null;
}

export function routingHome() {
  return makeDefaultOptionsHome({ withoutInstalledPlugins: true });
}

function claudeSession({ prompt, cell, arm, home }) {
  const [model, effort] = cell.split(':');
  const { scratch, tmp, roots } = makeRunFolder(arm);
  const startedAt = Date.now();
  const args = ['-p', prompt, '--model', model, '--effort', effort, '--output-format', 'stream-json', '--verbose', '--strict-mcp-config', '--plugin-dir', ROOT];
  const run = withHome(confinedClaude({ args, roots, cwd: scratch, tmp, settings: ARM_SETTINGS[arm] }), home);
  return new Promise((resolve) => {
    const child = spawn(run.command, run.args, { cwd: run.cwd, env: { ...process.env, ...run.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '';
    let stderr = '';
    let settled = false;
    const finish = (outcome, line) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      fs.rmSync(path.dirname(scratch), { recursive: true, force: true });
      const cost_usd = line === undefined ? null : costOfLine(line);
      resolve({ ...(outcome !== null && typeof outcome === 'object' ? outcome : { pick: outcome }), cost_usd, durationMs: Date.now() - startedAt });
    };
    const timer = setTimeout(() => finish({ error: `timeout after ${SESSION_MS} ms` }), SESSION_MS);
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-STDERR_TAIL); });
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const pick = pickOfLine(line);
        if (pick !== undefined) return finish(pick, line);
      }
    });
    child.on('error', (error) => finish({ error: `spawn failed: ${error.message}` }));
    child.on('close', (code, signal) => {
      const pick = pickOfLine(buffer);
      if (pick !== undefined) return finish(pick, buffer);
      if (code === 0) return finish(null);
      finish({ error: `${signal ? `signal ${signal}` : `exit ${code}`}: ${stderr.trim() || 'no stderr'}` });
    });
  });
}

async function inPool(jobs, concurrency) {
  const results = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const at = next++;
      results[at] = await jobs[at]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return results;
}

export function summarize(sessions, skills) {
  const table = {};
  for (const split of [...new Set(sessions.map((session) => session.split))]) {
    const inSplit = sessions.filter((session) => session.split === split && session.error === undefined);
    table[split] = {};
    for (const skill of skills) {
      const positives = inSplit.filter((session) => session.expect === skill);
      const others = inSplit.filter((session) => session.expect !== skill);
      table[split][skill] = {
        recall: positives.length ? positives.filter((session) => session.pick === skill).length / positives.length : null,
        falseTrigger: others.length ? others.filter((session) => session.pick === skill).length / others.length : null
      };
    }
  }
  return table;
}

function sessionRecord({ cell, arm, run, mode, entry }, outcome) {
  const { pick = null, error, cost_usd = null, durationMs = null } = outcome !== null && typeof outcome === 'object' ? outcome : { pick: outcome };
  const base = { cell, arm, run, mode, prompt: entry.prompt, expect: entry.expect, split: entry.split, cost_usd, durationMs };
  return error === undefined ? { ...base, pick } : { ...base, pick: null, error };
}

export async function evaluate({ prompts, cells, arms, runs, concurrency, skills, runSession, mode = 'full' }) {
  const jobs = [];
  for (const cell of cells) for (const arm of arms) for (const entry of prompts) {
    for (let run = 1; run <= runs; run += 1) {
      jobs.push(async () => {
        const outcome = await runSession({ prompt: entry.prompt, cell, arm });
        return sessionRecord({ cell, arm, run, mode, entry }, outcome);
      });
    }
  }
  const sessions = await inPool(jobs, concurrency);
  const results = {};
  const errors = {};
  for (const cell of cells) {
    results[cell] = {};
    errors[cell] = {};
    for (const arm of arms) {
      const inArm = sessions.filter((s) => s.cell === cell && s.arm === arm);
      results[cell][arm] = summarize(inArm, skills);
      errors[cell][arm] = inArm.filter((s) => s.error !== undefined).length;
    }
  }
  return { cells, arms, runs, results, errors, sessions };
}

function tierOf({ full, writeBaseline }) {
  if (full) return 'full';
  return writeBaseline ? 'baseline' : 'quick';
}

function readFlags(argv) {
  const flags = parseFlags(argv, { full: 'boolean', 'write-baseline': 'boolean', cells: 'value', runs: 'value', arms: 'value', split: 'value', concurrency: 'value', smoke: 'boolean', 'dry-run': 'boolean', out: 'value' }, { usage: USAGE });
  for (const name of ['runs', 'concurrency']) {
    if (flags[name] !== undefined && !POSITIVE_INTEGER.test(flags[name])) throw new UsageError(`--${name} needs a positive integer, got '${flags[name]}'`);
  }
  const full = flags.full === true;
  const writeBaseline = flags['write-baseline'] === true;
  if (full && writeBaseline) throw new UsageError('--full and --write-baseline exclude each other');
  if (flags.split !== undefined && !full) throw new UsageError('--split needs --full');
  const cells = (flags.cells ?? 'sonnet:low').split(',');
  for (const cell of cells) if (!CELL_PATTERN.test(cell)) throw new UsageError(`--cells entry '${cell}' needs the shape model:effort`);
  const tier = tierOf({ full, writeBaseline });
  const arms = (flags.arms ?? TIER_DEFAULTS[tier].arms).split(',');
  for (const arm of arms) if (!(arm in ARM_SETTINGS)) throw new UsageError(`--arms entry '${arm}' must be hook or no-hook`);
  if (flags.split !== undefined && !['train', 'held-out'].includes(flags.split)) throw new UsageError('--split must be train or held-out');
  const out = flags.out ?? TIER_DEFAULTS[tier].out;
  return { cells, arms, full, writeBaseline, split: flags.split, smoke: flags.smoke === true, dryRun: flags['dry-run'] === true, runs: Number(flags.runs ?? (full ? 3 : 1)), concurrency: Number(flags.concurrency ?? 4), out };
}

async function smoke(all, flags, runSession) {
  const known = all.find((entry) => entry.expect === SMOKE_SKILL);
  const outcome = await runSession({ prompt: known.prompt, cell: flags.cells[0], arm: flags.arms[0] });
  const pick = outcome.error === undefined ? outcome.pick : `error (${outcome.error})`;
  process.stdout.write(`smoke: expected ${SMOKE_SKILL}, got ${pick}\n`);
  if (pick !== SMOKE_SKILL) process.exitCode = 1;
}

function recordedSessions(file) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8')).sessions ?? [];
}

function readBaseline() {
  return fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : null;
}

function readPrompts() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'benchmarks/routing/prompts.json'), 'utf8'));
}

function planRun(flags, all) {
  if (flags.full) return { prompts: flags.split ? all.filter((entry) => entry.split === flags.split) : all, mode: 'full', arms: flags.arms, baseline: null };
  const prompts = quickPrompts(all);
  const mode = flags.writeBaseline ? 'baseline' : 'quick';
  if (mode === 'baseline' || flags.arms.includes('no-hook')) return { prompts, mode, arms: flags.arms, baseline: null };
  const baseline = readBaseline();
  const problem = baselineProblem(baseline, { cells: flags.cells, prompts: prompts.map((entry) => entry.prompt), hashes: descriptionHashes(ROOT) });
  if (problem === null) return { prompts, mode, arms: flags.arms, baseline };
  process.stdout.write(`baseline stale: ${problem}, running the no-hook arm live\n`);
  return { prompts, mode, arms: [...flags.arms, 'no-hook'], baseline: null };
}

function dryRun(flags) {
  const plan = planRun(flags, readPrompts());
  const sessionCount = plan.prompts.length * flags.cells.length * plan.arms.length * flags.runs;
  process.stdout.write(`${dryRunLine(sessionCount, recordedSessions(flags.out))}\n`);
}

async function main() {
  const flags = readFlags(process.argv.slice(2));
  if (flags.dryRun) return dryRun(flags);
  const refusal = confineRefusal();
  if (refusal) throw new UsageError(refusal);
  const all = readPrompts();
  const home = routingHome();
  try {
    const runSession = (job) => claudeSession({ ...job, home });
    if (flags.smoke) return await smoke(all, flags, runSession);
    const plan = planRun(flags, all);
    const outcome = await evaluate({ prompts: plan.prompts, cells: flags.cells, arms: plan.arms, runs: flags.runs, concurrency: flags.concurrency, skills: modelInvocableSkills(ROOT), runSession, mode: plan.mode });
    const combined = plan.baseline ? withBaseline(outcome, plan.baseline) : outcome;
    const split = flags.full ? flags.split ?? 'all' : 'held-out';
    const result = { ...combined, split, prompts: plan.prompts.map((entry) => entry.prompt), hashes: descriptionHashes(ROOT) };
    fs.mkdirSync(path.dirname(flags.out), { recursive: true });
    fs.writeFileSync(flags.out, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`wrote ${flags.out}\n`);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(error instanceof UsageError ? 2 : 1);
  });
}
