import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { importJobs } from '../benchmarks/tbench/import.mjs';
import { bootstrapPerSolved, calibrate, isAsk, readCells, renderReport, scoreStream } from '../benchmarks/tbench/readouts.mjs';
import { projectedSpend, watch } from '../benchmarks/tbench/watch.mjs';

const SCORE = path.join(import.meta.dirname, '..', 'benchmarks', 'score.mjs');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'exo-tbench-'));
}

function trial(job, name, { task = 'fix-git', reward = 1, cost = 1, seconds = 60, exception = null, stream = null, finished = true } = {}) {
  const directory = path.join(job, name);
  fs.mkdirSync(path.join(directory, 'agent'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'config.json'), '{}');
  if (stream) fs.writeFileSync(path.join(directory, 'agent', 'claude-code.txt'), `${JSON.stringify({ type: 'system' })}\nnot json\n${JSON.stringify({ type: 'result', ...stream })}\n`);
  if (!finished) return;
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify({
    task_name: `terminal-bench/${task}`,
    started_at: '2026-10-18T10:00:00Z',
    finished_at: '2026-10-18T10:05:00Z',
    agent_execution: { started_at: '2026-10-18T10:01:00Z', finished_at: new Date(Date.parse('2026-10-18T10:01:00Z') + seconds * 1000).toISOString() },
    agent_result: { cost_usd: cost },
    verifier_result: reward === null ? null : { rewards: { reward } },
    exception_info: exception ? { exception_type: exception } : null
  }));
}

const MODEL_USAGE = { 'claude-sonnet-5-5': { inputTokens: 100, cacheReadInputTokens: 1000, cacheCreationInputTokens: 200, outputTokens: 50 } };

function cell(out, task, { arm, run }) {
  const directory = path.join(out, task, arm, String(run));
  return {
    checks: JSON.parse(fs.readFileSync(path.join(directory, 'checks.json'), 'utf8')),
    result: JSON.parse(fs.readFileSync(path.join(directory, 'result.json'), 'utf8')),
    usage: fs.existsSync(path.join(directory, 'usage.json')) ? JSON.parse(fs.readFileSync(path.join(directory, 'usage.json'), 'utf8')) : null
  };
}

test('T1 import classifies pass, fail, max_turns, rate-limit, timeout and skips a cancelled trial', () => {
  const job = tmp();
  trial(job, 'a', { stream: { subtype: 'success', modelUsage: MODEL_USAGE } });
  trial(job, 'b', { reward: 0 });
  trial(job, 'c', { reward: 0, stream: { subtype: 'error_max_turns', is_error: false } });
  trial(job, 'd', { reward: null, exception: 'ApiRateLimitError' });
  trial(job, 'e', { reward: null, stream: { subtype: 'success', is_error: true, result: 'API Error: 429 rate_limit_error' } });
  trial(job, 'f', { reward: null, exception: 'AgentTimeoutError' });
  trial(job, 'g', { reward: null, exception: 'CancelledError' });
  const out = tmp();
  const meta = importJobs({ jobs: [{ directory: job, arm: 'exo' }], out, model: 'm', date: '2026-10-18' });
  assert.equal(meta.cells, 6);
  assert.equal(meta.infra, 2);
  assert.equal(meta.runs, 6);
  const [pass, fail, turns, limited, streamLimited, timeout] = [1, 2, 3, 4, 5, 6].map((run) => cell(out, 'fix-git', { arm: 'exo', run }));
  assert.equal(pass.checks.pass, true);
  assert.equal(pass.checks.wallMs, 60000);
  assert.equal(pass.result.total_cost_usd, 1);
  assert.equal(pass.usage.counts.weightedInput, 100 + 1000 * 0.1 + 200 * 1.25);
  assert.equal(pass.usage.counts.output, 50);
  assert.equal(fail.checks.pass, false);
  assert.equal(fail.checks.harnessError, undefined);
  assert.equal(turns.checks.pass, false);
  assert.equal(turns.checks.maxTurns, true);
  assert.equal(turns.checks.harnessError, undefined);
  assert.equal(limited.checks.harnessError, 'rate-limit');
  assert.equal(streamLimited.checks.harnessError, 'rate-limit');
  assert.equal(timeout.checks.timedOut, true);
  assert.equal(timeout.checks.harnessError, undefined);
});

test('T2 an infra cell in the control arm drops its task from every arm', () => {
  const before = tmp();
  const after = tmp();
  trial(before, 'a', { task: 'one', reward: null, exception: 'ApiRateLimitError' });
  trial(before, 'b', { task: 'two' });
  trial(after, 'c', { task: 'one' });
  trial(after, 'd', { task: 'two' });
  const out = tmp();
  const meta = importJobs({ jobs: [{ directory: before, arm: 'exo-before' }, { directory: after, arm: 'exo' }], out, model: 'm' });
  assert.deepEqual(meta.droppedTasks, ['one']);
  assert.deepEqual(meta.tasks, ['two']);
  assert.equal(fs.existsSync(path.join(out, 'one')), false);
});

test('T3 score.mjs --compare reads the imported run and leaves an infra cell out of the means', () => {
  const before = tmp();
  const after = tmp();
  [1, 2, 3].forEach((n) => trial(before, `b${n}`, { cost: 1 + n / 10, stream: { modelUsage: MODEL_USAGE } }));
  [1, 2, 3].forEach((n) => trial(after, `a${n}`, { cost: 2 + n / 10, stream: { modelUsage: MODEL_USAGE } }));
  trial(after, 'a4', { reward: null, exception: 'ApiRateLimitError', cost: 9 });
  const out = tmp();
  importJobs({ jobs: [{ directory: before, arm: 'exo-before' }, { directory: after, arm: 'exo' }], out, model: 'm' });
  const run = spawnSync(process.execPath, [SCORE, out, '--compare', 'exo-before,exo'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /\| fix-git \| cost \| 3 \| 3 \|/);
  assert.match(run.stdout, /\| fix-git \| pass \| 3 \| 3 \|/);
});

test('W1 projected spend charges a running trial the job highest finished cost, trialUsd when none finished', () => {
  const job = tmp();
  trial(job, 'a', { cost: 2.5 });
  trial(job, 'b', { cost: 0.5 });
  trial(job, 'c', { finished: false });
  assert.deepEqual(projectedSpend([job], 1.5), { finished: 3, running: 1, projected: 5.5 });
  const fresh = tmp();
  trial(fresh, 'x', { finished: false });
  assert.deepEqual(projectedSpend([fresh], 1.5), { finished: 0, running: 1, projected: 1.5 });
  assert.equal(projectedSpend([fresh]).projected, 1.5);
});

test('W2 the watcher sends SIGTERM once projected spend reaches the limit', async () => {
  const job = tmp();
  trial(job, 'a', { cost: 13 });
  trial(job, 'b', { finished: false });
  trial(job, 'c', { finished: false });
  const kills = [];
  const result = await watch({ jobs: [job], pid: 4242, limit: 55, rounds: 2, kill: (pid, signal) => kills.push([pid, signal]), alive: () => true, sleep: async () => {} });
  assert.equal(result.status, 'rounds');
  assert.equal(result.projected, 39);
  assert.deepEqual(kills, []);
  trial(job, 'd', { finished: false });
  trial(job, 'e', { finished: false });
  const second = await watch({ jobs: [job], pid: 4242, limit: 55, kill: (pid, signal) => kills.push([pid, signal]), alive: () => true, sleep: async () => {} });
  assert.equal(second.status, 'cancelled');
  assert.deepEqual(kills, [[4242, 'SIGTERM']]);
});

test('W3 the watcher stops after its rounds, and when the process has ended', async () => {
  const job = tmp();
  trial(job, 'a', { cost: 1 });
  let sleeps = 0;
  const kill = () => assert.fail('under the limit');
  const spent = await watch({ jobs: [job], pid: 1, limit: 55, rounds: 3, kill, alive: () => true, sleep: async () => { sleeps += 1; } });
  assert.equal(spent.status, 'rounds');
  assert.equal(sleeps, 3);
  const done = await watch({ jobs: [job], pid: 1, limit: 55, rounds: 3, kill, alive: () => false, sleep: async () => {} });
  assert.equal(done.status, 'done');
});

test('A1 the agent declares plugin_dir in its options model, which Harbor validates --ak against', (t) => {
  const python = path.join(os.homedir(), '.local', 'share', 'uv', 'tools', 'harbor', 'bin', 'python');
  if (!fs.existsSync(python)) return t.skip('harbor is not installed');
  const code = 'import sys; sys.path.insert(0, sys.argv[1]); from exo_agent import ExoClaudeCode as A; A.parse_options({"plugin_dir": "/x"}); print("ok")';
  const run = spawnSync(python, ['-I', '-B', '-c', code, path.join(import.meta.dirname, '..', 'benchmarks', 'tbench')], { encoding: 'utf8' });
  assert.equal(run.stdout.trim(), 'ok', run.stderr);
});

const NODE_CHECK = [
  'import sys, hashlib, tempfile',
  'sys.path.insert(0, sys.argv[1])',
  'import exo_agent as e',
  'name = f"node-{e.NODE_VERSION}-linux-arm64.tar.gz"',
  'calls = []',
  'def get(url):',
  '    calls.append(url)',
  '    return f"{hashlib.sha256(b\'t\').hexdigest()}  {name}\\n".encode() if url.endswith("SHASUMS256.txt") else b"t"',
  'cache = tempfile.mkdtemp()',
  'path = e.node_tarball("aarch64", cache, get); e.node_tarball("aarch64", cache, get)',
  'assert path.name == name and sum(not c.endswith("SHASUMS256.txt") for c in calls) == 1, calls',
  'path.write_bytes(b"bad")',
  'try: e.node_tarball("aarch64", cache, get)',
  'except RuntimeError as error: assert "SHA256 mismatch" in str(error)',
  'else: raise SystemExit("mismatch accepted")',
  'print("ok")'
].join('\n');

test('A2 node_tarball caches a SHA256-checked tarball per arch and fails loudly on a mismatch', (t) => {
  const python = path.join(os.homedir(), '.local', 'share', 'uv', 'tools', 'harbor', 'bin', 'python');
  if (!fs.existsSync(python)) return t.skip('harbor is not installed');
  const run = spawnSync(python, ['-I', '-B', '-c', NODE_CHECK, path.join(import.meta.dirname, '..', 'benchmarks', 'tbench')], { encoding: 'utf8' });
  assert.equal(run.stdout.trim(), 'ok', run.stderr);
});

function use(name, input) {
  return { type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } };
}

test('R1 a closing ask counts on "?", on an ask phrase ending in "!", not on a bare "!"', () => {
  assert.equal(isAsk('Merged.\nWant me to merge this into master now?'), true);
  assert.equal(isAsk("Done.\nLet me know how you'd like to proceed!"), true);
  assert.equal(isAsk('Which option do you prefer?**'), true);
  assert.equal(isAsk('The merge is complete!'), false);
  assert.equal(isAsk('Should I stop?\nA\nB\nAll merged.'), false);
});

test('R3 scoreStream reads asks from the trial stream, an AskUserQuestion call counting too', () => {
  const job = tmp();
  trial(job, 'a', { stream: { subtype: 'success', result: 'All merged!' } });
  const events = [{ type: 'result', subtype: 'success', result: "Let me know how you'd like to proceed!" }];
  fs.writeFileSync(path.join(job, 'a', 'agent', 'claude-code.txt'), events.map((event) => JSON.stringify(event)).join('\n'));
  assert.deepEqual(scoreStream(path.join(job, 'a')), { ask: true, askTool: false });
  trial(job, 'b', { stream: { subtype: 'success', result: 'Done.' } });
  fs.appendFileSync(path.join(job, 'b', 'agent', 'claude-code.txt'), `${JSON.stringify(use('AskUserQuestion', {}))}\n`);
  assert.deepEqual(scoreStream(path.join(job, 'b')), { ask: true, askTool: true });
});

test('R4 the report orders per solved task, passing cells only, raw per cell, and falls back when nothing passes', () => {
  const before = tmp();
  const after = tmp();
  trial(before, 'b1', { cost: 1, seconds: 10 });
  trial(before, 'b2', { cost: 3, seconds: 30, reward: 0 });
  trial(after, 'a1', { cost: 2, seconds: 20, reward: 0 });
  const cells = readCells([{ directory: before, arm: 'exo-before' }, { directory: after, arm: 'exo' }]);
  const report = renderReport(cells);
  assert.ok(report.indexOf('## 1. Cost and wall per solved task') < report.indexOf('## 2. Passing cells only'));
  assert.ok(report.indexOf('## 2. Passing cells only') < report.indexOf('## 3. Raw per cell'));
  assert.match(report, /\| exo-before \| 1\/2 \| \$4\.000 /);
  assert.match(report, /\| exo \| 0\/1 \| none \(0 passes\) /);
  assert.match(report, /\| fix-git \| exo-before \| \$1\.000 \(n=1\)/);
  assert.match(report, /\| fix-git \| exo-before \| \$2\.000 ±\$2\.000 \(n=2\)/);
  assert.equal(bootstrapPerSolved(cells.filter((cell) => cell.arm === 'exo'), 'cost'), null);
});

test('R5 the report adds token mix, setup wall, paired cost with a sign test and failing transcripts', () => {
  const before = tmp();
  const after = tmp();
  const stream = { subtype: 'success', num_turns: 7, modelUsage: { m: { outputTokens: 50, cacheCreationInputTokens: 200, thinkingTokens: 30 } } };
  trial(before, 'b1', { cost: 3, stream });
  trial(after, 'a1', { cost: 2, reward: 0, stream });
  const result = path.join(after, 'a1', 'result.json');
  const data = JSON.parse(fs.readFileSync(result, 'utf8'));
  data.agent_setup = { started_at: '2026-10-18T10:00:00Z', finished_at: '2026-10-18T10:00:30Z' };
  fs.writeFileSync(result, JSON.stringify(data));
  const report = renderReport(readCells([{ directory: before, arm: 'exo-before' }, { directory: after, arm: 'exo' }]));
  assert.match(report, /\| fix-git \| exo \| 50 \| 7 \| 200 \| 30 \| 60\.0 s \| 30\.0 s \|/);
  assert.match(report, /\| fix-git \| \$2\.000 \| \$3\.000 \|/);
  assert.match(report, /exo-before cheaper on 0 of 1 decided tasks, sign test p=1\.000/);
  assert.match(report, /- fix-git exo: .*a1.agent.claude-code\.txt/);
  assert.doesNotMatch(report, /ledger/);
});

test('R6 --calibrate lists mixed tasks and prints saturated, exit 3, under 4 mixed', () => {
  const job = tmp();
  ['a', 'b', 'c', 'd'].forEach((task) => {
    trial(job, `${task}1`, { task });
    trial(job, `${task}2`, { task, reward: 0 });
  });
  const run = (directory) => spawnSync(process.execPath, [path.join(import.meta.dirname, '..', 'benchmarks', 'tbench', 'readouts.mjs'), '--job', `${directory}=exo`, '--calibrate'], { encoding: 'utf8' });
  const mixed = run(job);
  assert.equal(mixed.status, 0, mixed.stderr);
  assert.match(mixed.stdout, /mixed tasks \(4\): a, b, c, d/);
  fs.rmSync(path.join(job, 'd2'), { recursive: true });
  const saturated = run(job);
  assert.equal(saturated.status, 3);
  assert.match(saturated.stdout, /saturated/);
  assert.equal(calibrate(readCells([{ directory: job, arm: 'exo' }])).mixed.length, 3);
});
