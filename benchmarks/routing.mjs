#!/usr/bin/env node

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { confineRefusal, confinedClaude } from '#confine-claude';
import { makeDefaultOptionsHome } from '#default-options-home';
import { UsageError, parseFlags, isMain, environmentMs } from '#script-flags';
import { makeRunFolder, withHome } from '../skills/edit-skills/scripts/pressure.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SESSION_MS = environmentMs('EXO_ROUTING_SESSION_MS', 120_000);
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const CELL_PATTERN = /^[^:]+:[^:]+$/;
const ARM_SETTINGS = { hook: undefined, 'no-hook': { disableAllHooks: true } };
const STDERR_TAIL = 500;
const SMOKE_SKILL = 'build';
const USAGE = `usage: routing.mjs [--cells <model:effort,...>] [--runs <n>] [--arms hook,no-hook] [--split train|held-out] [--concurrency <n>] [--smoke] [--out <file>]
Runs every prompt of benchmarks/routing/prompts.json per cell, arm and run, and writes per-arm per-split per-skill recall and false-trigger rate plus description hashes.
--smoke runs one known-good prompt and exits 1 on a miss. Defaults: cell sonnet:low, --runs 3, --concurrency 4, --out benchmarks/results/routing.json.`;

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

export function gradeStream(text) {
  for (const line of text.split('\n')) {
    const pick = pickOfLine(line);
    if (pick !== undefined) return pick;
  }
  return null;
}

function claudeSession({ prompt, cell, arm, home }) {
  const [model, effort] = cell.split(':');
  const { scratch, tmp, roots } = makeRunFolder(arm);
  const args = ['-p', prompt, '--model', model, '--effort', effort, '--output-format', 'stream-json', '--verbose', '--strict-mcp-config', '--plugin-dir', ROOT];
  const run = withHome(confinedClaude({ args, roots, cwd: scratch, tmp, settings: ARM_SETTINGS[arm] }), home);
  return new Promise((resolve) => {
    const child = spawn(run.command, run.args, { cwd: run.cwd, env: { ...process.env, ...run.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '';
    let stderr = '';
    let settled = false;
    const finish = (pick) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      fs.rmSync(path.dirname(scratch), { recursive: true, force: true });
      resolve(pick);
    };
    const timer = setTimeout(() => finish({ error: `timeout after ${SESSION_MS} ms` }), SESSION_MS);
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-STDERR_TAIL); });
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const pick = pickOfLine(line);
        if (pick !== undefined) return finish(pick);
      }
    });
    child.on('error', (error) => finish({ error: `spawn failed: ${error.message}` }));
    child.on('close', (code, signal) => {
      const pick = pickOfLine(buffer);
      if (pick !== undefined) return finish(pick);
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

export async function evaluate({ prompts, cells, arms, runs, concurrency, skills, runSession }) {
  const jobs = [];
  for (const cell of cells) for (const arm of arms) for (const entry of prompts) {
    for (let run = 1; run <= runs; run += 1) {
      jobs.push(async () => {
        const outcome = await runSession({ prompt: entry.prompt, cell, arm });
        const failed = outcome !== null && typeof outcome === 'object';
        const base = { cell, arm, run, prompt: entry.prompt, expect: entry.expect, split: entry.split };
        return failed ? { ...base, pick: null, error: outcome.error } : { ...base, pick: outcome };
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

function readFlags(argv) {
  const flags = parseFlags(argv, { cells: 'value', runs: 'value', arms: 'value', split: 'value', concurrency: 'value', smoke: 'boolean', out: 'value' }, { usage: USAGE });
  for (const name of ['runs', 'concurrency']) {
    if (flags[name] !== undefined && !POSITIVE_INTEGER.test(flags[name])) throw new UsageError(`--${name} needs a positive integer, got '${flags[name]}'`);
  }
  const cells = (flags.cells ?? 'sonnet:low').split(',');
  for (const cell of cells) if (!CELL_PATTERN.test(cell)) throw new UsageError(`--cells entry '${cell}' needs the shape model:effort`);
  const arms = (flags.arms ?? 'hook,no-hook').split(',');
  for (const arm of arms) if (!(arm in ARM_SETTINGS)) throw new UsageError(`--arms entry '${arm}' must be hook or no-hook`);
  if (flags.split !== undefined && !['train', 'held-out'].includes(flags.split)) throw new UsageError('--split must be train or held-out');
  return { cells, arms, split: flags.split, smoke: flags.smoke === true, runs: Number(flags.runs ?? 3), concurrency: Number(flags.concurrency ?? 4), out: flags.out ?? path.join(ROOT, 'benchmarks/results/routing.json') };
}

async function smoke(all, flags, runSession) {
  const known = all.find((entry) => entry.expect === SMOKE_SKILL);
  const outcome = await runSession({ prompt: known.prompt, cell: flags.cells[0], arm: flags.arms[0] });
  const pick = outcome?.error === undefined ? outcome : `error (${outcome.error})`;
  process.stdout.write(`smoke: expected ${SMOKE_SKILL}, got ${pick}\n`);
  if (pick !== SMOKE_SKILL) process.exitCode = 1;
}

async function main() {
  const flags = readFlags(process.argv.slice(2));
  const refusal = confineRefusal();
  if (refusal) throw new UsageError(refusal);
  const all = JSON.parse(fs.readFileSync(path.join(ROOT, 'benchmarks/routing/prompts.json'), 'utf8'));
  const home = makeDefaultOptionsHome();
  try {
    const runSession = (job) => claudeSession({ ...job, home });
    if (flags.smoke) return await smoke(all, flags, runSession);
    const prompts = flags.split ? all.filter((entry) => entry.split === flags.split) : all;
    const outcome = await evaluate({ prompts, cells: flags.cells, arms: flags.arms, runs: flags.runs, concurrency: flags.concurrency, skills: modelInvocableSkills(ROOT), runSession });
    const result = { ...outcome, split: flags.split ?? 'all', hashes: descriptionHashes(ROOT) };
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
