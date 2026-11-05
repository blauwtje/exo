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
import { withHome } from '../skills/edit-skills/scripts/pressure-home.mjs';
import { makeRunFolder } from '../skills/edit-skills/scripts/pressure-run-folder.mjs';
import { makeCellHome } from './cell-home.mjs';
import { withoutParentSession } from './lean-gates.mjs';
import { plannedPowerLine } from './power-plan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENTS = ['review-branch', 'find-open-points'];
const SESSION_MS = environmentMs('EXO_ISOLATION_PROBE_MS', 180_000);
const USAGE = `usage: isolation-probe.mjs [--full] [--dry-run]
Starts a session that holds a random marker and dispatches ${AGENTS.join(' and ')} with the Agent tool without it; passes when both were dispatched and no result of theirs holds the marker. Default tier: quick, one session. --full runs the eval graduationRuns sessions. --dry-run spends nothing and prints the plan and the cost cap. Exit 1 when a session fails, 3 when one did not run (timeout, budget cap, no result, marker pasted into a brief) and none failed, 2 on a usage error.`;

function parseEvents(stream) {
  return stream.split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

const blocks = (event) => (Array.isArray(event.message?.content) ? event.message.content : []);

function textOf(content) {
  return typeof content === 'string' ? content : (content ?? []).map((part) => part.text ?? '').join('\n');
}

export function gradeStream(stream, marker) {
  const events = parseEvents(stream);
  const result = events.find((event) => event.type === 'result');
  if (!result) return { verdict: 'UNRUN', cause: 'no result event' };
  if (result.subtype !== 'success' || result.is_error) return { verdict: 'UNRUN', cause: `result ${result.subtype}` };
  const dispatches = events.filter((event) => event.type === 'assistant').flatMap(blocks)
    .filter((block) => block.type === 'tool_use' && block.name === 'Agent')
    .map((block) => ({ id: block.id, agent: AGENTS.find((agent) => block.input?.subagent_type === `exo:${agent}`), brief: JSON.stringify(block.input), background: Boolean(block.input?.run_in_background) }));
  const leaked = dispatches.find((dispatch) => dispatch.brief.includes(marker));
  if (leaked) return { verdict: 'UNRUN', cause: `marker pasted into the ${leaked.agent ?? 'agent'} brief` };
  const missing = AGENTS.filter((agent) => !dispatches.some((dispatch) => dispatch.agent === agent));
  if (missing.length > 0) return { verdict: 'FAIL', cause: `not dispatched: ${missing.join(', ')}` };
  const returned = events.filter((event) => event.type === 'user').flatMap((event) => blocks(event).filter((block) => block.type === 'tool_result')
    .map((block) => ({ ...block, async: Boolean(event.toolUseResult?.isAsync || event.toolUseResult?.status === 'async_launched') })));
  for (const { id, agent, background } of dispatches.filter((dispatch) => dispatch.agent)) {
    const reply = returned.find((block) => block.tool_use_id === id);
    if (!reply) return { verdict: 'UNRUN', cause: `no result from ${agent}` };
    if (reply.is_error) return { verdict: 'UNRUN', cause: `${agent} errored` };
    if (background || reply.async) return { verdict: 'UNRUN', cause: `${agent} ran in the background` };
    const own = events.filter((event) => event.parent_tool_use_id === id).flatMap(blocks).map((block) => block.text ?? block.thinking ?? '');
    if ([textOf(reply.content), ...own].some((text) => text.includes(marker))) return { verdict: 'FAIL', cause: `${agent} output holds the marker` };
  }
  return { verdict: 'PASS', cause: '' };
}

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

function main() {
  const flags = parseFlags(process.argv.slice(2), { full: 'boolean', 'dry-run': 'boolean' }, { usage: USAGE });
  const tier = flags.full ? 'full' : 'quick';
  const runs = flags.full ? evalDefaults().graduationRuns : 1;
  const config = loadRunConfig({ home: os.homedir() });
  const { trialUsd } = config.defaults.tbench;
  if (flags['dry-run']) {
    process.stdout.write(`dry-run: ${tier} tier, ${runs} sessions, each dispatching ${AGENTS.join(', ')}; cost cap ${runs} x $${trialUsd} = $${runs * trialUsd}\n${plannedPowerLine({ tasks: AGENTS.length, samples: runs })}\n`);
    return;
  }
  const refusal = confineRefusal();
  if (refusal) throw new UsageError(refusal);
  const home = makeCellHome();
  try {
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
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(error instanceof UsageError ? 2 : 1);
  }
}
