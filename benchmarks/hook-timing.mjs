#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { environmentMs } from '../lib/script-flags.mjs';
import { readJson } from './basics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMMANDS = 100;
const EXTRA_MS_LIMIT = 30;

export const extraLimitMs = () => environmentMs('EXO_HOOK_EXTRA_MS', EXTRA_MS_LIMIT);

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
  },
  {
    name: 'worker count read',
    script: 'dispatch-bash.mjs',
    without: BASH_BASE,
    with: { ...BASH_BASE, agent_id: 'timing-orchestrator', agent_type: 'orchestrator' }
  }
];

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function extraMilliseconds(withStep, withoutStep) {
  return median(withStep) - median(withoutStep);
}

export function verdictFor(extras, limit = extraLimitMs()) {
  return extras.every((extra) => extra < limit) ? 'KEEP' : 'DISCARD';
}

export function spawnMilliseconds(script, input) {
  const started = performance.now();
  spawnSync(process.execPath, [script], { input: JSON.stringify(input), encoding: 'utf8', cwd: ROOT, timeout: 60000 });
  return performance.now() - started;
}

export function timeCase(timing, count = COMMANDS) {
  const script = path.join(ROOT, 'hooks', timing.script);
  const sample = (input) => Array.from({ length: count }, () => spawnMilliseconds(script, input));
  return extraMilliseconds(sample(timing.with), sample(timing.without));
}

export const SESSION_MIX = {
  sessions: 300,
  events: { SessionStart: 1.04, SessionEnd: 1, Stop: 14.9, SubagentStop: 13.1 },
  lead: { Bash: 30.4, Agent: 5.8, Read: 0.8, ToolSearch: 0.8, mcp__x: 0.7, Skill: 0.5, Write: 0.5, AskUserQuestion: 0.3, Edit: 0.3 },
  agent: { Bash: 200.7, Read: 31.4, WebFetch: 8.6, mcp__x: 8.1, Agent: 7.4, Write: 6.5, Edit: 3.5, WebSearch: 3.4, ToolSearch: 1.4, Grep: 1, Skill: 0.9, Glob: 0.1 }
};

const TOOL_INPUTS = {
  Bash: { command: 'git status' },
  Agent: { subagent_type: 'exo:locate-code', description: 'x', prompt: 'Reads: none' },
  Read: { file_path: path.join(ROOT, 'package.json') },
  Edit: { file_path: path.join(ROOT, 'package.json'), old_string: 'a', new_string: 'a' },
  Write: { file_path: path.join(os.tmpdir(), 'exo-hook-timing.txt'), content: 'x' },
  Skill: { skill: 'exo:build' },
  AskUserQuestion: {}
};

export function hookEntries(hooks = readJson(path.join(ROOT, 'hooks', 'hooks.json')).hooks) {
  return Object.entries(hooks).flatMap(([event, groups]) => groups.flatMap((group) => group.hooks.map((hook) => ({ event, matcher: group.matcher, command: hook.command }))));
}

export function matchingEntries(entries, event, tool) {
  return entries.filter((entry) => entry.event === event && (tool === undefined || entry.matcher === undefined || new RegExp(`^(?:${entry.matcher})$`).test(tool)));
}

function fixture() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-hook-timing-'));
  const repository = path.join(folder, 'repo');
  fs.mkdirSync(repository);
  spawnSync('git', ['init', '-q', repository]);
  const transcript = path.join(folder, 'session.jsonl');
  const usage = `${JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { usage: { input_tokens: 20000, output_tokens: 10 } } })}\n`;
  fs.writeFileSync(transcript, usage);
  fs.mkdirSync(path.join(folder, 'session', 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'session', 'subagents', 'agent-timing-agent.jsonl'), usage);
  return { folder, repository, transcript };
}

function payloadFor(event, tool, role, { repository, transcript }) {
  const base = { hook_event_name: event, session_id: 'hook-timing', cwd: repository, transcript_path: transcript, permission_mode: 'bypassPermissions' };
  const agent = role === 'agent' ? { agent_id: 'timing-agent', agent_type: 'general-purpose' } : {};
  const toolFields = tool === undefined ? { source: 'startup' } : { tool_name: tool, tool_input: TOOL_INPUTS[tool] ?? { query: 'x' }, tool_use_id: 'hook-timing' };
  return { ...base, ...agent, ...toolFields };
}

function hookEnvironment(folder) {
  const environment = { ...process.env, CLAUDE_PLUGIN_ROOT: ROOT, CLAUDE_PROJECT_DIR: path.join(folder, 'repo'), CLAUDE_CONFIG_DIR: path.join(folder, 'config') };
  for (const name of ['EXO_RUN', 'EXO_RUN_DIR', 'EXO_RUN_HANDOFF', 'EXO_RUN_SESSION', 'TE_SIDECALL']) delete environment[name];
  return environment;
}

export function entryMilliseconds(entry, input, environment) {
  const started = performance.now();
  spawnSync('bash', ['-c', entry.command], { input: JSON.stringify(input), encoding: 'utf8', env: environment, cwd: input.cwd });
  return performance.now() - started;
}

export function timeCall(entries, event, tool, role, context, count) {
  return matchingEntries(entries, event, tool).reduce((total, entry) => {
    const input = payloadFor(event, tool, role, context);
    return total + median(Array.from({ length: count }, () => entryMilliseconds(entry, input, context.environment)));
  }, 0);
}

export function sessionCost(entries, count = 15, mix = SESSION_MIX) {
  const context = fixture();
  context.environment = hookEnvironment(context.folder);
  const rows = [];
  for (const [event, calls] of Object.entries(mix.events)) rows.push({ role: 'event', name: event, calls, ms: timeCall(entries, event, undefined, 'lead', context, Math.min(count, 5)) });
  for (const role of ['lead', 'agent']) {
    for (const [tool, calls] of Object.entries(mix[role])) rows.push({ role, name: tool, calls, ms: timeCall(entries, 'PreToolUse', tool, role, context, count) });
  }
  fs.rmSync(context.folder, { recursive: true, force: true });
  return { rows, total: rows.reduce((sum, row) => sum + row.ms * row.calls, 0) };
}

function printSessionCost() {
  const entries = hookEntries();
  const { rows, total } = sessionCost(entries);
  for (const row of rows) console.log(`${row.role} ${row.name}: ${row.ms.toFixed(1)} ms per call x ${row.calls} calls = ${(row.ms * row.calls).toFixed(0)} ms`);
  console.log(`${entries.length} hook entries, ${(total / 1000).toFixed(2)} s hook time per session (mix of ${SESSION_MIX.sessions} sessions)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--entries')) {
  printSessionCost();
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const extras = CASES.map((timing) => timeCase(timing));
  CASES.forEach((timing, index) => console.log(`${timing.name}: ${extras[index].toFixed(1)} ms median extra over ${COMMANDS} commands`));
  console.log(`${verdictFor(extras)} (limit ${extraLimitMs()} ms)`);
}
