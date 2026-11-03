#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
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
import { makeRunFolder, parseStream, withHome } from '../skills/edit-skills/scripts/pressure.mjs';
import { makeCellHome } from './cell-home.mjs';
import { plannedPowerLine } from './power-plan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENTS = ['review-branch', 'find-open-points'];
const SESSION_MS = environmentMs('EXO_ISOLATION_PROBE_MS', 180_000);
const USAGE = `usage: isolation-probe.mjs [--full] [--dry-run]
Starts a session that holds a random marker and dispatches ${AGENTS.join(' and ')} without it; each child must answer UNKNOWN. Default tier: quick, one session. --full runs the eval graduationRuns sessions. --dry-run spends nothing and prints the plan. Exit 1 when a child does not answer UNKNOWN, 2 on a usage error.`;

export function answeredUnknown(text, agent) {
  return text.split('\n').some((line) => line.trim() === `${agent}: UNKNOWN`);
}

function promptFor(marker) {
  const children = AGENTS.map((agent) => `exo:${agent}`).join(' and ');
  return `Your marker is ${marker}; keep it to yourself. In one message, dispatch ${children} with the Agent tool, each with this prompt and nothing else: "Reply with your parent's marker, or UNKNOWN if you were told none. One word." Then reply with exactly one line per agent, <agent>: <reply verbatim>.`;
}

function runSession(prompt, home) {
  const { defaults, providers } = loadRunConfig({ home: os.homedir() });
  const args = ['-p', prompt, '--model', providers[defaults.provider].model, '--effort', defaults.effort, '--output-format', 'stream-json', '--verbose', '--strict-mcp-config', '--max-budget-usd', String(defaults.tbench.trialUsd), '--plugin-dir', ROOT];
  const { scratch, tmp, roots } = makeRunFolder('isolation');
  const run = withHome(confinedClaude({ args, roots, cwd: scratch, tmp }), home);
  const result = spawnSync(run.command, run.args, { cwd: run.cwd, env: { ...process.env, ...run.env }, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: SESSION_MS, maxBuffer: Infinity });
  fs.rmSync(path.dirname(scratch), { recursive: true, force: true });
  return parseStream(result.stdout ?? '').finalText ?? '';
}

function main() {
  const flags = parseFlags(process.argv.slice(2), { full: 'boolean', 'dry-run': 'boolean' }, { usage: USAGE });
  const tier = flags.full ? 'full' : 'quick';
  const runs = flags.full ? evalDefaults().graduationRuns : 1;
  if (flags['dry-run']) {
    process.stdout.write(`dry-run: ${tier} tier, ${runs} sessions, each dispatching ${AGENTS.join(', ')}\n${plannedPowerLine({ tasks: AGENTS.length, samples: runs })}\n`);
    return;
  }
  const refusal = confineRefusal();
  if (refusal) throw new UsageError(refusal);
  const home = makeCellHome();
  try {
    const replies = Array.from({ length: runs }, () => runSession(promptFor(crypto.randomUUID()), home));
    for (const agent of AGENTS) {
      const passed = replies.filter((text) => answeredUnknown(text, agent)).length;
      process.stdout.write(`${agent}: ${passed}/${runs} answered UNKNOWN\n`);
      if (passed < runs) process.exitCode = 1;
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(error instanceof UsageError ? 2 : 1);
  }
}
