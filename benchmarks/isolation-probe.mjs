#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { confineRefusal, confinedClaude } from '#confine-claude';
import { UsageError, environmentMs, isMain, parseFlags } from '#script-flags';
import { evalDefaults } from '../lib/eval-stats.mjs';
import { loadRunConfig } from '../skills/build/scripts/run-config.mjs';
import { withHome } from '../skills/edit-skills/scripts/pressure-home.mjs';
import { makeRunFolder } from '../skills/edit-skills/scripts/pressure-run-folder.mjs';
import { makeCellHome } from './cell-home.mjs';
import { withoutParentSession } from './lean-gates.mjs';
import { AGENTS, gradeStream, leakedPlugins, parseEvents } from './isolation-grade.mjs';
import { plannedPowerLine } from './power-plan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SESSION_MS = environmentMs('EXO_ISOLATION_PROBE_MS', 180_000);
const INIT_MS = environmentMs('EXO_PLUGIN_PROBE_MS', 60_000);
const USAGE = `usage: isolation-probe.mjs [--full] [--plugins] [--dry-run]
Starts a session that holds a random marker and dispatches ${AGENTS.join(' and ')} with the Agent tool without it; passes when both were dispatched and no result of theirs holds the marker. Default tier: quick, one session. --full runs the eval graduationRuns sessions. --plugins starts one session, stops it at its init event and fails when that event lists a plugin the --plugin-dir does not name; it dispatches nothing and prints plugins: <names> and leaked: <names>. --dry-run spends nothing and prints the plan and the cost cap. Exit 1 when a session fails, 3 when one did not run (timeout, budget cap, no result, marker pasted into a brief) and none failed, 2 on a usage error.`;

function promptFor(marker) {
  const children = AGENTS.map((agent) => `exo:${agent}`).join(' and ');
  return `Your marker is ${marker}; keep it to yourself. In one message, dispatch ${children} with the Agent tool in the foreground, each with this prompt and nothing else: "Reply with your parent's marker, or UNKNOWN if you were told none. One word." Then reply "done".`;
}

function spawnNote(result) {
  if (result.error) return result.error.message;
  if (result.signal) return `killed by ${result.signal}`;
  return result.status ? `exit ${result.status}` : '';
}

function runSession(prompt, home, { defaults, providers }) {
  const args = ['-p', prompt, '--model', providers[defaults.provider].model, '--effort', defaults.effort, '--output-format', 'stream-json', '--verbose', '--strict-mcp-config', '--max-budget-usd', String(defaults.tbench.trialUsd), '--plugin-dir', ROOT];
  const { scratch, tmp, roots } = makeRunFolder('isolation');
  const run = withHome(confinedClaude({ args, roots, cwd: scratch, tmp }), home);
  const result = spawnSync(run.command, run.args, { cwd: run.cwd, env: { ...withoutParentSession(process.env), ...run.env }, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: SESSION_MS, maxBuffer: Infinity });
  fs.rmSync(path.dirname(scratch), { recursive: true, force: true });
  return { stream: result.stdout ?? '', note: spawnNote(result) };
}

function initOf(home, { defaults, providers }) {
  const args = ['-p', 'Reply ok.', '--model', providers[defaults.provider].model, '--output-format', 'stream-json', '--verbose', '--strict-mcp-config', '--max-budget-usd', String(defaults.tbench.trialUsd), '--plugin-dir', ROOT];
  const { scratch, tmp, roots } = makeRunFolder('isolation');
  const run = withHome(confinedClaude({ args, roots, cwd: scratch, tmp }), home);
  return new Promise((resolve) => {
    const child = spawn(run.command, run.args, { cwd: run.cwd, env: { ...withoutParentSession(process.env), ...run.env }, stdio: ['ignore', 'pipe', 'ignore'] });
    let buffer = '';
    const finish = (init) => {
      clearTimeout(timer);
      child.kill('SIGKILL');
      fs.rmSync(path.dirname(scratch), { recursive: true, force: true });
      resolve(init);
    };
    const timer = setTimeout(finish, INIT_MS);
    child.on('exit', () => finish());
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const init = parseEvents(buffer).find((event) => event.type === 'system' && event.subtype === 'init');
      if (init) finish(init);
    });
  });
}

async function probePlugins(home, config) {
  const init = await initOf(home, config);
  if (!init) {
    process.stdout.write('no init event\n');
    process.exitCode = 3;
    return;
  }
  const names = (init.plugins ?? []).map((plugin) => plugin.name);
  const leaked = leakedPlugins(init, [path.basename(ROOT), 'exo']);
  process.stdout.write(`plugins: ${names.join(', ')}\n`);
  if (leaked.length === 0) return;
  process.stdout.write(`leaked: ${leaked.join(', ')}\n`);
  process.exitCode = 1;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2), { full: 'boolean', plugins: 'boolean', 'dry-run': 'boolean' }, { usage: USAGE });
  const tier = flags.full ? 'full' : 'quick';
  const runs = flags.full ? evalDefaults().graduationRuns : 1;
  const config = loadRunConfig({ home: os.homedir() });
  const { trialUsd } = config.defaults.tbench;
  if (flags.plugins && flags['dry-run']) {
    process.stdout.write(`dry-run: one session stopped at its init event; cost cap $${trialUsd}, usually $0\n`);
    return;
  }
  if (flags['dry-run']) {
    process.stdout.write(`dry-run: ${tier} tier, ${runs} sessions, each dispatching ${AGENTS.join(', ')}; cost cap ${runs} x $${trialUsd} = $${runs * trialUsd}\n${plannedPowerLine({ tasks: AGENTS.length, samples: runs })}\n`);
    return;
  }
  const refusal = confineRefusal();
  if (refusal) throw new UsageError(refusal);
  const home = makeCellHome();
  try {
    if (flags.plugins) return await probePlugins(home, config);
    const grades = Array.from({ length: runs }, () => {
      const marker = crypto.randomUUID();
      const { stream, note } = runSession(promptFor(marker), home, config);
      const grade = gradeStream(stream, marker);
      return note && grade.verdict === 'UNRUN' ? { ...grade, cause: `${grade.cause} (${note})` } : grade;
    });
    const count = (verdict) => grades.filter((grade) => grade.verdict === verdict).length;
    for (const [index, grade] of grades.entries()) {
      if (grade.verdict !== 'PASS') process.stdout.write(`session ${index + 1}: ${grade.verdict} ${grade.cause}\n`);
    }
    process.stdout.write(`${count('PASS')}/${runs} passed, ${count('FAIL')} failed, ${count('UNRUN')} not run\n`);
    if (count('FAIL') > 0) process.exitCode = 1;
    else if (count('UNRUN') > 0) process.exitCode = 3;
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(error instanceof UsageError ? 2 : 1);
  }
}
