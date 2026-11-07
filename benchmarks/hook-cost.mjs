#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { median } from './hook-timing.mjs';
import { readJson } from './basics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = 20;

export function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

export function sampleTool(matcher) {
  const first = matcher.split('|')[0];
  return first.endsWith('.*') ? `${first.slice(0, -2)}x__y` : first;
}

const TOOL_INPUTS = {
  Bash: { command: 'git status' },
  Agent: { subagent_type: 'exo:locate-code', description: 'x', prompt: 'Reads: none' },
  Read: { file_path: path.join(ROOT, 'package.json') },
  Edit: { file_path: path.join(os.tmpdir(), 'exo-hook-cost.txt'), old_string: 'a', new_string: 'b' }
};

export function payloadFor({ event, matcher }, cwd) {
  const base = { hook_event_name: event, session_id: 'hook-cost', cwd };
  if (event === 'SessionStart') return { ...base, source: 'startup' };
  if (matcher === undefined) return base;
  const tool = sampleTool(matcher);
  return { ...base, tool_name: tool, tool_input: TOOL_INPUTS[tool] ?? {} };
}

export function entriesOf(hooksConfig) {
  return Object.entries(hooksConfig.hooks).flatMap(([event, groups]) => groups.flatMap((group) => group.hooks.map((hook) => ({ event, matcher: group.matcher, command: hook.command }))));
}

function measure(entry, cwd) {
  const input = JSON.stringify(payloadFor(entry, cwd));
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: ROOT, HOME: cwd };
  for (const name of ['EXO_RUN', 'EXO_RUN_DIR', 'EXO_RUN_HANDOFF']) delete env[name];
  const times = [];
  let bytes = 0;
  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now();
    const result = spawnSync('bash', ['-c', entry.command], { input, env, cwd, encoding: 'utf8' });
    times.push(performance.now() - started);
    bytes = Buffer.byteLength(result.stdout ?? '', 'utf8');
  }
  return { median: median(times), p95: percentile(times, 0.95), bytes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-hook-cost-'));
  console.log('event | matcher | median ms | p95 ms | output bytes');
  for (const entry of entriesOf(readJson(path.join(ROOT, 'hooks', 'hooks.json')))) {
    const row = measure(entry, cwd);
    console.log(`${entry.event} | ${entry.matcher ?? '-'} | ${row.median.toFixed(1)} | ${row.p95.toFixed(1)} | ${row.bytes}`);
  }
  fs.rmSync(cwd, { recursive: true, force: true });
}
