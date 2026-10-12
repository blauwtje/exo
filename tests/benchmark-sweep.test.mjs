// The sweep asks for nothing billed unless invoked on purpose: without
// --confirm it prints how many `claude -p` calls it would make and starts none.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeRunUsage } from '../benchmarks/cell-usage.mjs';
import { ROOT } from '../benchmarks/tasks.mjs';
import { fixture, run } from './harness.mjs';

const SWEEP = fileURLToPath(new URL('../benchmarks/sweep.mjs', import.meta.url));

// A stand-in `claude` first on PATH leaves a file when called, so any started process shows.
async function fakeClaude() {
  const bin = await fixture();
  const marker = path.join(bin, 'called');
  await fs.writeFile(path.join(bin, 'claude'), `#!/bin/sh\ntouch "${marker}"\n`, { mode: 0o755 });
  return { env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` }, marker };
}

test('without --confirm the sweep prints its call count and starts no claude process', async () => {
  const { env, marker } = await fakeClaude();
  const result = await run(SWEEP, ['--set', 'all'], { env });
  assert.equal(result.code, 2, result.stderr);
  assert.match(result.stdout, /^50 claude -p calls planned, one per cell:/);
  assert.match(result.stdout, /review-safe-path-seeded-low: --model claude-opus-5-5 --effort low/);
  assert.match(result.stdout, /plan-fable-xhigh: --model claude-fable-5-1 --effort xhigh/);
  assert.match(result.stdout, /Re-run with --confirm/);
  await assert.rejects(fs.access(marker));
});

test('a named set counts only its cells', async () => {
  const { env, marker } = await fakeClaude();
  const result = await run(SWEEP, ['--set', 'plan,flow'], { env });
  assert.equal(result.code, 2, result.stderr);
  assert.match(result.stdout, /^7 claude -p calls planned/);
  await assert.rejects(fs.access(marker));
});

test('--cells keeps only the named cells of the chosen sets', async () => {
  const { env, marker } = await fakeClaude();
  const result = await run(SWEEP, ['--set', 'flow', '--cells', 'flow-c7,flow-base'], { env });
  assert.equal(result.code, 2, result.stderr);
  assert.match(result.stdout, /^2 claude -p calls planned/);
  assert.match(result.stdout, /flow-c7:/);
  assert.match(result.stdout, /flow-base:/);
  assert.doesNotMatch(result.stdout, /flow-session/);
  await assert.rejects(fs.access(marker));
});

test('an unknown --cells id stops before any call', async () => {
  const { env, marker } = await fakeClaude();
  const result = await run(SWEEP, ['--set', 'flow', '--cells', 'flow-c7,plan-fable-xhigh'], { env });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /unknown cell plan-fable-xhigh in the chosen sets; one of flow-c7, /);
  assert.doesNotMatch(result.stdout, /calls planned/);
  await assert.rejects(fs.access(marker));
});

test('a fixer cell prepares a branch carrying a real branch-review.md fixture', async () => {
  const { env } = await fakeClaude();
  const out = await fixture();
  const results = await fixture();
  const result = await run(SWEEP, ['--set', 'fixer', '--confirm', '--concurrency', '1', '--out', out, '--results', results], { env });
  assert.equal(result.code, 0, result.stderr);
  const report = await fs.readFile(path.join(out, 'fixer-safe-path', 'branch-review.md'), 'utf8');
  assert.match(report, /^FINDINGS/);
  assert.match(report, /uploads\.js:\d+-\d+ .*fix\s*$/m);
  const published = await fs.readdir(results);
  assert.equal(published.filter((name) => name.endsWith('-sweep.md')).length, 1, published.join(', '));
});

test('meta.json records the plugin commit, and a second start keeps it', async () => {
  const { env } = await fakeClaude();
  const out = await fixture();
  const results = await fixture();
  const args = ['--set', 'fixer', '--confirm', '--concurrency', '1', '--out', out, '--results', results];
  const first = await run(SWEEP, args, { env });
  assert.equal(first.code, 0, first.stderr);
  const file = path.join(out, 'meta.json');
  const meta = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.deepEqual(Object.keys(meta.pluginCommits), [ROOT]);
  assert.match(meta.pluginCommits[ROOT], /^[0-9a-f]{40}$/);
  assert.equal(typeof meta.pluginDirty, 'boolean');
  meta.pluginCommits[ROOT] = 'a'.repeat(40);
  await fs.writeFile(file, JSON.stringify(meta));
  const second = await run(SWEEP, args, { env });
  assert.equal(second.code, 0, second.stderr);
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).pluginCommits[ROOT], 'a'.repeat(40));
});

// A stand-in `claude` that records the plugin folder each call loads, whether
// that folder holds the session build loop.
async function loggingClaude() {
  const bin = await fixture();
  await fs.writeFile(path.join(bin, 'claude'), [
    '#!/usr/bin/env node',
    "const fs = require('node:fs');",
    "if (process.argv.includes('--version')) { console.log('0.0.0 (fake)'); process.exit(0); }",
    "const at = process.argv.indexOf('--plugin-dir');",
    "const plugin = at === -1 ? null : process.argv[at + 1];",
    "const read = (file) => plugin === null ? null : fs.readFileSync(`${plugin}/${file}`, 'utf8');",
    // The confined run writes nowhere outside its cell, so the stub reports on stderr, which sweep.mjs keeps as the cell's stderr.log.
    `process.stderr.write(JSON.stringify({ plugin, loop: read('skills/build/references/run-loop-direct.md') }) + '\\n');`,
    "console.log(JSON.stringify({ result: 'done', total_cost_usd: 0 }));"
  ].join('\n'), { mode: 0o755 });
  return { env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` } };
}

test('a session flow cell loads its variant copy and every other flow cell keeps its argv', async () => {
  const { env } = await loggingClaude();
  const out = await fixture();
  const results = await fixture();
  const result = await run(SWEEP, ['--set', 'flow', '--cells', 'flow-c7,flow-session,flow-base', '--confirm', '--concurrency', '1', '--out', out, '--results', results], { env });
  assert.equal(result.code, 0, result.stderr);
  const logs = (await fs.readdir(out, { recursive: true })).filter((entry) => entry.endsWith('stderr.log'));
  const [exo, session, base] = await Promise.all(['flow-c7', 'flow-session', 'flow-base']
    .map(async (id) => JSON.parse((await fs.readFile(path.join(out, logs.find((entry) => entry.split(path.sep).includes(id))), 'utf8')).trim())));
  const sessionLoop = await fs.readFile(path.join(ROOT, 'benchmarks', 'arms', 'build-session.md'), 'utf8');
  assert.equal(exo.plugin, ROOT);
  assert.equal(base.plugin, null);
  assert.notEqual(session.plugin, ROOT);
  assert.notEqual(exo.loop, sessionLoop);
  assert.equal(session.loop, sessionLoop);
  for (const copy of [session.plugin]) await assert.rejects(fs.access(copy), copy);
});

test('an unknown flag stops before any call', async () => {
  const { env, marker } = await fakeClaude();
  const result = await run(SWEEP, ['--sets', 'all'], { env });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /unknown flag --sets/);
  await assert.rejects(fs.access(marker));
});

const CONFINED_CHILD = fileURLToPath(new URL('../benchmarks/confined-child.mjs', import.meta.url));

test('the confining wrapper refuses to start claude without a cell root or outside it', async () => {
  const { env, marker } = await fakeClaude();
  const root = await fixture();
  const outside = await fixture();
  const bare = await run(CONFINED_CHILD, ['-p'], { env, cwd: root });
  assert.equal(bare.code, 1);
  assert.match(bare.stderr, /EXO_SWEEP_CELL_ROOT names no cell root/);
  const escaped = await run(CONFINED_CHILD, ['-p'], { env: { ...env, EXO_SWEEP_CELL_ROOT: root }, cwd: outside });
  assert.equal(escaped.code, 1);
  assert.match(escaped.stderr, /outside the cell root/);
  await assert.rejects(fs.access(marker));
});

// Polls `check` every 100 ms and fails after `rounds` rounds.
async function until(check, what, rounds = 300) {
  for (let round = 0; round < rounds; round += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`gave up waiting for ${what}`);
}

// The inherited environment with an empty Claude config and no run pin, then `overrides`.
async function spawnEnv(overrides) {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: await fixture(), ...overrides };
  delete env.EXO_RUN_TASK;
  return env;
}

test('the confining wrapper passes SIGTERM on to the claude it started', async () => {
  const bin = await fixture();
  const root = await fixture();
  await fs.writeFile(path.join(bin, 'claude'), [
    '#!/bin/sh',
    'trap "echo term > got-term; exit 143" TERM',
    'echo $ > ready',
    'while :; do sleep 0.2; done'
  ].join('\n'), { mode: 0o755 });
  const env = await spawnEnv({ PATH: `${bin}${path.delimiter}${process.env.PATH}`, EXO_SWEEP_CELL_ROOT: root });
  const wrapper = spawn(process.execPath, [CONFINED_CHILD, '-p'], { cwd: root, env, stdio: 'ignore' });
  const closed = once(wrapper, 'close');
  const ready = path.join(root, 'ready');
  try {
    await until(async () => (await fs.readFile(ready, 'utf8').catch(() => '')).trim() !== '', 'claude to start');
    wrapper.kill('SIGTERM');
    const [code] = await closed;
    assert.equal(code, 143);
    await fs.access(path.join(root, 'got-term'));
  } finally {
    const pid = Number((await fs.readFile(ready, 'utf8').catch(() => '')).trim());
    if (pid > 0 && alive(pid)) process.kill(pid, 'SIGKILL');
  }
});

// One transcript line per message id; a repeated id counts once across sessions.
async function ledgerOf(sessions) {
  const config = await fixture();
  const project = path.join(config, 'projects', 'slug');
  await fs.mkdir(project, { recursive: true });
  const message = (id) => JSON.stringify({ type: 'assistant', message: { id, model: 'm', usage: { input_tokens: 10, output_tokens: 5 } } });
  await fs.writeFile(path.join(project, 'a1.jsonl'), `${message('x')}\n${message('y')}\n`);
  await fs.writeFile(path.join(project, 'b2.jsonl'), `${message('y')}\n${message('z')}\n`);
  process.env.CLAUDE_CONFIG_DIR = config;
  const directory = await fixture();
  const ledger = path.join(directory, 'sessions.jsonl');
  await fs.writeFile(ledger, sessions.map((session) => JSON.stringify(session)).join('\n') + '\n');
  return { directory, ledger };
}

test('a run cell sums cost and tokens over the ledger sessions, each message once, and counts build sessions without hooks', async () => {
  const { directory, ledger } = await ledgerOf([
    { kind: 'task', task: 1, sessionId: 'a1', costUsd: 0.25, hooks: 3 },
    { kind: 'review', task: null, sessionId: 'b2', costUsd: 0.5, hooks: 0 }
  ]);
  const usage = writeRunUsage(directory, ledger);
  assert.equal(usage.costUsd, 0.75);
  assert.equal(usage.counts.output, 15);
  assert.equal(usage.missingHooks, 0);
  assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'usage.json'), 'utf8')).sessions, 2);
});

test('a build session whose hooks never ran marks the run cell as missing exo', async () => {
  const { directory, ledger } = await ledgerOf([{ kind: 'plan', task: 1, sessionId: 'a1', costUsd: 0.1, hooks: 0 }]);
  assert.equal(writeRunUsage(directory, ledger).missingHooks, 1);
});

test('a run cell killed mid-write keeps the usage of its complete ledger lines and skips the truncated last one', async () => {
  const { directory, ledger } = await ledgerOf([{ kind: 'task', task: 1, sessionId: 'a1', costUsd: 0.25, hooks: 3 }]);
  await fs.appendFile(ledger, '{"kind":"review","task":null,"sessionId":"b2","cos');
  const usage = writeRunUsage(directory, ledger);
  assert.equal(usage.sessions, 1);
  assert.equal(usage.costUsd, 0.25);
  assert.equal(usage.counts.output, 10);
  assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'usage.json'), 'utf8')).sessions, 1);
});

test('a broken ledger line before the last still fails loudly', async () => {
  const { directory, ledger } = await ledgerOf([{ kind: 'task', task: 1, sessionId: 'a1', costUsd: 0.25, hooks: 3 }]);
  await fs.writeFile(ledger, `{"kind":"task","ses\n${await fs.readFile(ledger, 'utf8')}`);
  assert.throws(() => writeRunUsage(directory, ledger), SyntaxError);
});

// A stand-in `claude` that starts a grandchild ignoring SIGTERM and hangs; the
// grandchild's pid and, if it outlives the cell folder, a mark go to stderr.log.
async function hangingClaude() {
  const bin = await fixture();
  await fs.writeFile(path.join(bin, 'claude'), [
    '#!/bin/sh',
    '[ "$1" = "--version" ] && { echo 0.0.0; exit 0; }',
    `sh -c 'trap "" TERM; echo "pid $$" >&2; while sleep 0.2; do [ -d "$0" ] || echo "ORPHAN" >&2; done' "$PWD" &`,
    'wait'
  ].join('\n'), { mode: 0o755 });
  return { PATH: `${bin}${path.delimiter}${process.env.PATH}`, EXO_SWEEP_CELL_TIMEOUT_MS: '1500' };
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

test('a cell time-out ends the cell process tree before its folder goes', async () => {
  const env = await hangingClaude();
  const out = await fixture();
  const results = await fixture();
  const result = await run(SWEEP, ['--set', 'flow', '--cells', 'flow-base', '--confirm', '--concurrency', '1', '--out', out, '--results', results], { env });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /TIMED OUT/);
  const log = await fs.readFile(path.join(out, 'flow-base', 'stderr.log'), 'utf8');
  const pids = [...log.matchAll(/^pid (\d+)$/gm)].map((match) => Number(match[1]));
  assert.ok(pids.length > 0, log);
  await new Promise((resolve) => setTimeout(resolve, 500));
  for (const pid of pids) assert.equal(alive(pid), false, `grandchild ${pid} still alive`);
  assert.doesNotMatch(log, /ORPHAN/);
});

// A stand-in `claude` that logs its pid and hangs. In flow-session it leaves
// 3 s after SIGTERM, in every other cell at once, so one cell closes while the
// other still runs and the pool has a free lane.
async function stoppableClaude() {
  const bin = await fixture();
  await fs.writeFile(path.join(bin, 'claude'), [
    '#!/bin/sh',
    '[ "$1" = "--version" ] && { echo 0.0.0; exit 0; }',
    'case "$PWD" in *exo-sweep-flow-session-*) trap "sleep 3; exit 143" TERM ;; *) trap "exit 143" TERM ;; esac',
    'echo "pid $$" >&2',
    'while :; do sleep 0.2; done'
  ].join('\n'), { mode: 0o755 });
  return bin;
}

test("the sweep's own SIGTERM ends every running cell, starts no other and records none", async () => {
  const bin = await stoppableClaude();
  const out = await fixture();
  const results = await fixture();
  const env = await spawnEnv({ PATH: `${bin}${path.delimiter}${process.env.PATH}`, EXO_SWEEP_CELL_TIMEOUT_MS: '20000' });
  const args = ['--set', 'flow', '--cells', 'flow-c7,flow-session,flow-base', '--confirm', '--concurrency', '2', '--out', out, '--results', results];
  const sweep = spawn(process.execPath, [SWEEP, ...args], { env, stdio: 'ignore' });
  const closed = once(sweep, 'close');
  const deadline = setTimeout(() => sweep.kill('SIGKILL'), 60_000);
  const logOf = (cell) => fs.readFile(path.join(out, cell, 'stderr.log'), 'utf8').catch(() => '');
  const started = ['flow-c7', 'flow-session'];
  await until(async () => (await Promise.all(started.map(logOf))).every((log) => /^pid \d+$/m.test(log)), 'both cells to start');
  sweep.kill('SIGTERM');
  const [code] = await closed;
  clearTimeout(deadline);
  assert.equal(code, 130);
  await assert.rejects(fs.access(path.join(out, 'flow-base')), 'flow-base started after the signal');
  for (const cell of started) {
    await assert.rejects(fs.access(path.join(out, cell, 'record.json')), `${cell} recorded a result`);
    for (const [, pid] of (await logOf(cell)).matchAll(/^pid (\d+)$/gm)) assert.equal(alive(Number(pid)), false, `${cell} claude ${pid} still alive`);
  }
});

// Loaded into the sweep: every group signal finds its group gone, and a signal
// to a bare pid is logged to KILL_LOG instead of sent.
const GROUP_GONE = [
  "import fs from 'node:fs';",
  'process.kill = (pid, signal) => {',
  "  if (pid < 0) throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });",
  "  fs.appendFileSync(process.env.KILL_LOG, `${pid} ${signal}\\n`);",
  '  return true;',
  '};'
].join('\n');

test('a closed cell has only its process group signalled, never its bare pid, which may be reused', async () => {
  const bin = await fixture();
  await fs.writeFile(path.join(bin, 'claude'), '#!/bin/sh\n[ "$1" = "--version" ] && echo 0.0.0\nexit 0\n', { mode: 0o755 });
  const preload = path.join(bin, 'group-gone.mjs');
  await fs.writeFile(preload, GROUP_GONE);
  const killLog = path.join(bin, 'kills.log');
  const out = await fixture();
  const results = await fixture();
  const env = { PATH: `${bin}${path.delimiter}${process.env.PATH}`, NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`, KILL_LOG: killLog };
  const result = await run(SWEEP, ['--set', 'flow', '--cells', 'flow-base', '--confirm', '--concurrency', '1', '--out', out, '--results', results], { env });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(await fs.readFile(killLog, 'utf8').catch(() => ''), '');
});
