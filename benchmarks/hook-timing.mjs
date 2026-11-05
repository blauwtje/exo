#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { HOOK_SPAWN_MS_LOCK } from '../verify/budgets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMMANDS = 100;

const BASH_BASE = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git status' }, session_id: 'hook-timing' };
const AGENT_BASE = {
  hook_event_name: 'PreToolUse',
  tool_name: 'Agent',
  tool_input: { subagent_type: 'exo:lookup', prompt: 'Reads: none' },
  session_id: 'hook-timing'
};

export const CASES = [
  {
    name: 'result cap step',
    script: 'dispatch-bash.mjs',
    without: BASH_BASE,
    with: { ...BASH_BASE, agent_id: 'timing-worker', agent_type: 'general-purpose', permission_mode: 'bypassPermissions' }
  },
  {
    name: 'slice file',
    script: 'agent-effort.mjs',
    without: AGENT_BASE,
    with: { ...AGENT_BASE, agent_id: 'timing-orchestrator', agent_type: 'orchestrator' }
  }
];

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function extraMilliseconds(withStep, withoutStep) {
  return median(withStep) - median(withoutStep);
}

export function verdictFor(extras, limit = HOOK_SPAWN_MS_LOCK.ms) {
  return extras.every((extra) => extra < limit) ? 'KEEP' : 'DISCARD';
}

export function spawnMilliseconds(script, input) {
  const started = performance.now();
  spawnSync(process.execPath, [script], { input: JSON.stringify(input), encoding: 'utf8', cwd: ROOT });
  return performance.now() - started;
}

export function timeCase(timing, count = COMMANDS) {
  const script = path.join(ROOT, 'hooks', timing.script);
  const sample = (input) => Array.from({ length: count }, () => spawnMilliseconds(script, input));
  return extraMilliseconds(sample(timing.with), sample(timing.without));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const extras = CASES.map((timing) => timeCase(timing));
  CASES.forEach((timing, index) => console.log(`${timing.name}: ${extras[index].toFixed(1)} ms median extra over ${COMMANDS} commands`));
  console.log(`${verdictFor(extras)} (limit ${HOOK_SPAWN_MS_LOCK.ms} ms)`);
}
