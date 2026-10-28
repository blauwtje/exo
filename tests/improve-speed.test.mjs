import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { contentKey } from '../benchmarks/baseline-pool.mjs';
import { quickVerdict, scoreOutDir } from '../benchmarks/improve-speed.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'benchmarks', 'improve-speed.mjs');
const GOOD_RECORD = { exitCode: 0, timedOut: false, hiddenPass: true, defects: [], verifyRan: true, outputTokens: 100 };

const stamp = (second) => new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString();
const call = (id, second) => ({ type: 'assistant', timestamp: stamp(second), message: { id, usage: { output_tokens: 1 }, content: [] } });
const bash = (id, command, second) => ({ type: 'assistant', timestamp: stamp(second), message: { id: `m-${id}`, usage: { output_tokens: 1 }, content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] } });
const result = (id, content, isError = false) => ({ type: 'user', timestamp: stamp(0), message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] } });
const lines = (entries) => `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`;

function makeCell(out, name, options = {}) {
  const directory = path.join(out, name);
  const transcript = path.join(out, `${name}.jsonl`);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'record.json'), JSON.stringify({ ...GOOD_RECORD, ...options.record }));
  fs.writeFileSync(path.join(directory, 'usage.json'), JSON.stringify({ transcript, subagents: options.types ?? [] }));
  const gate = options.gate ?? [bash('v1', 'node verify.mjs --plan p', 1), result('v1', 'PASS Task 1')];
  if (!options.noTranscript) fs.writeFileSync(transcript, lines([call('a', 0), ...gate, ...(options.main ?? [])]));
  return { directory, transcript };
}

function addChild(transcript, id, { parent, entries }) {
  const folder = path.join(transcript.replace(/\.jsonl$/, ''), 'subagents');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, `agent-${id}.jsonl`), lines(entries));
  fs.writeFileSync(path.join(folder, `agent-${id}.meta.json`), JSON.stringify(parent ? { parentAgentId: parent } : {}));
}

function fixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'improve-speed-test-'));
}

function reasons(out) {
  return scoreOutDir(out).rows.flatMap((row) => row.failures);
}

const verifyGate = (output, isError = false) => [bash('v', 'node verify.mjs', 1), result('v', output, isError)];

const FAILURE_CASES = {
  exit: { options: { record: { exitCode: 1 } }, expected: ['exit code not 0'] },
  timeout: { options: { record: { timedOut: true } }, expected: ['timed out'] },
  hidden: { options: { record: { hiddenPass: false } }, expected: ['hidden tests failed'] },
  defects: { options: { record: { defects: ['x'] } }, expected: ['defects found'] },
  unverified: { options: { record: { verifyRan: false } }, expected: ['verify gate not run'] },
  missing: { options: { noTranscript: true }, expected: ['transcript missing'] },
  nogate: { options: { gate: [] }, expected: ['verify gate not run'] },
  failline: { options: { gate: verifyGate('PASS a\nFAIL Task 2') }, expected: ['verify gate failed'] },
  unplanned: { options: { gate: verifyGate('UNPLANNED file') }, expected: ['verify gate failed'] },
  errored: { options: { gate: verifyGate('boom', true) }, expected: ['verify gate failed'] },
};

test('each failure reason is reported', () => {
  const out = fixture();
  for (const [name, { options }] of Object.entries(FAILURE_CASES)) makeCell(out, name, options);
  const byCell = Object.fromEntries(scoreOutDir(out).rows.map((row) => [row.cell, row.failures]));
  for (const [name, { expected }] of Object.entries(FAILURE_CASES)) assert.deepEqual(byCell[name], expected);
});

test('a passing cell has no failure and the last verify run decides', () => {
  const out = fixture();
  const gate = [bash('v1', 'node verify.mjs', 1), result('v1', 'FAIL Task 1'), bash('v2', 'node verify.mjs', 2), result('v2', [{ type: 'text', text: 'PASS Task 1' }])];
  makeCell(out, 'ok', { gate });
  assert.deepEqual(reasons(out), []);
});

test('calls dedupe by message id across agents and outputTokens and fixRounds come from the saved files', () => {
  const out = fixture();
  const { transcript } = makeCell(out, 'c', { types: ['exo:fix-review', 'exo:build-task', 'exo:fix-review'], record: { outputTokens: 7 } });
  addChild(transcript, 'x', { parent: undefined, entries: [call('a', 5), call('b', 6)] });
  const [row] = scoreOutDir(out).rows;
  assert.equal(row.calls, 3);
  assert.equal(row.fixRounds, 2);
  assert.equal(row.outputTokens, 7);
});

test('pathCalls adds the largest of overlapping children and sums separate groups', () => {
  const out = fixture();
  const { transcript } = makeCell(out, 'p');
  addChild(transcript, 'a', { parent: undefined, entries: [call('a1', 10), call('a2', 20)] });
  addChild(transcript, 'b', { parent: undefined, entries: [call('b1', 15), call('b2', 16), call('b3', 17), call('b4', 18)] });
  addChild(transcript, 'c', { parent: undefined, entries: [call('c1', 30), call('c2', 31), call('c3', 32)] });
  addChild(transcript, 'n', { parent: 'c', entries: [call('n1', 30), call('n2', 31)] });
  const [row] = scoreOutDir(out).rows;
  assert.equal(row.pathCalls, 2 + 4 + (3 + 2));
  assert.equal(row.calls, 2 + 2 + 4 + 3 + 2);
});

test('measures are means rounded to two decimals', () => {
  const out = fixture();
  makeCell(out, 'one', { record: { outputTokens: 1 } });
  makeCell(out, 'two', { record: { outputTokens: 2 } });
  makeCell(out, 'three', { record: { outputTokens: 2 } });
  assert.equal(scoreOutDir(out).measures.outputTokens, 1.67);
});

test('cost is the mean of the record costUsd per cell and stays unscored when a record lacks it', () => {
  const out = fixture();
  makeCell(out, 'one', { record: { costUsd: 0.5 } });
  makeCell(out, 'two', { record: { costUsd: 0.75 } });
  const scored = scoreOutDir(out);
  assert.equal(scored.rows[0].cost, 0.5);
  assert.equal(scored.measures.cost, 0.625);
  const cell = spawnSync(process.execPath, [SCRIPT, '--from', out, '--full', '--measure', 'cost'], { encoding: 'utf8' });
  assert.match(cell.stdout, /^score: 0.625$/m);
  makeCell(out, 'three');
  assert.equal(scoreOutDir(out).measures.cost, null);
});

test('the command prints score on a good out dir and exits 1 with FAIL lines otherwise', () => {
  const out = fixture();
  makeCell(out, 'ok');
  const good = spawnSync(process.execPath, [SCRIPT, '--from', out, '--full', '--measure', 'calls'], { encoding: 'utf8' });
  assert.equal(good.status, 0);
  assert.match(good.stdout, /^score: 2$/m);
  const verdict = JSON.parse(good.stdout.split('\n').find((line) => line.startsWith('{')));
  assert.equal(verdict.mode, 'full');
  assert.equal(verdict.measures.calls, 2);
  makeCell(out, 'bad', { record: { hiddenPass: false } });
  const bad = spawnSync(process.execPath, [SCRIPT, '--from', out, '--full'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /^FAIL bad hidden tests failed$/m);
  assert.doesNotMatch(bad.stdout, /score:/);
  const empty = spawnSync(process.execPath, [SCRIPT, '--from', fixture(), '--full'], { encoding: 'utf8' });
  assert.equal(empty.status, 1);
  assert.match(empty.stdout, /FAIL no cells/);
});

test('an unknown measure exits 2 and starts no sweep', () => {
  const run = spawnSync(process.execPath, [SCRIPT, '--from', fixture(), '--measure', 'wall'], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /usage:/);
});

function pastFlowUnit(checkout, records) {
  records.forEach((record, index) => {
    const directory = path.join(checkout, 'benchmarks', 'runs', `old-${index}`, 'flow-unit');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'record.json'), JSON.stringify({ id: 'flow-unit', ...record }));
  });
}

test('--dry-run prints the projection for the repeat count and starts no cell', () => {
  const checkout = fixture();
  pastFlowUnit(checkout, [{ costUsd: 0.5, wallMs: 60000 }, { costUsd: 0.7, wallMs: 120000 }]);
  const run = spawnSync(process.execPath, [SCRIPT, checkout, '--dry-run', '--repeat', '3'], { encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /^projected \$1\.80 and 4\.5 min of cell time from past records \(3 of 3 cells; 0 have no past record/m);
  assert.doesNotMatch(run.stdout, /^(log|out) /m);
});

test('--dry-run says the cost is unknown when no past record exists', () => {
  const run = spawnSync(process.execPath, [SCRIPT, fixture(), '--dry-run', '--repeat', '2'], { encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /projected cost and time unknown: none of the 2 cells has a past record/);
});

test('--dry-run without --repeat projects the one quick cell', () => {
  const run = spawnSync(process.execPath, [SCRIPT, fixture(), '--dry-run'], { encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /none of the 1 cells has a past record/);
});

const BASE = { commit: 'abc', n: 3, mean: 0.6, max: 0.8 };
const row = (options = {}) => ({ cell: 'c', failures: [], hiddenPass: true, cost: 0.5, durationMs: 1000, ...options });

test('quickVerdict rejects a failure or a cost above the base maximum, promotes below the mean and is silent otherwise', () => {
  assert.equal(quickVerdict(row({ failures: ['hidden tests failed'], hiddenPass: false }), BASE).verdict, 'reject');
  assert.equal(quickVerdict(row({ cost: 0.81 }), BASE).verdict, 'reject');
  assert.equal(quickVerdict(row({ cost: 0.59 }), BASE).verdict, 'promote');
  assert.equal(quickVerdict(row({ cost: 0.7 }), BASE).verdict, 'no signal');
  assert.equal(quickVerdict(row({ cost: 0.8 }), BASE).verdict, 'no signal');
  assert.equal(quickVerdict(row({ cost: undefined }), BASE).verdict, 'no signal');
});

test('quickVerdict carries the cell hidden result, cost, duration and the base', () => {
  assert.deepEqual(quickVerdict(row(), BASE), { mode: 'quick', verdict: 'promote', hiddenPass: true, cost_usd: 0.5, durationMs: 1000, base: BASE });
});

function pooledBase(costs) {
  const directory = fixture();
  const results = path.join(directory, '2026-01-01-base.md');
  fs.writeFileSync(results, `| run | cost $ | tokens | wall s |\n|---|---|---|---|\n${costs.map((cost, index) => `| b-${index} | ${cost} | 100 | 60 |`).join('\n')}\n`);
  const key = contentKey({ commit: 'HEAD', cell: 'flow-unit', model: 'claude-sonnet-5-5', effort: 'high', claudeVersion: STUB_VERSION });
  const pool = path.join(directory, 'pool.jsonl');
  fs.writeFileSync(pool, `${JSON.stringify({ key, results, arm: 'b-' })}\n`);
  return pool;
}

const STUB_VERSION = '9.9.9';

function stubClaudePath() {
  const directory = fixture();
  fs.writeFileSync(path.join(directory, 'claude'), `#!/bin/sh\necho "${STUB_VERSION} (Claude Code)"\n`, { mode: 0o755 });
  return `${directory}${path.delimiter}${process.env.PATH}`;
}

const STUB_PATH = stubClaudePath();
const quickRun = (out, pool, extra = []) => spawnSync(process.execPath, [SCRIPT, '--from', out, '--base', 'HEAD', '--pool', pool, ...extra], { encoding: 'utf8', env: { ...process.env, PATH: STUB_PATH } });

test('the pooled base is looked up under the installed Claude Code version unless --claude-version overrides it', () => {
  const pool = pooledBase([0.5, 0.7, 0.9]);
  const out = fixture();
  makeCell(out, 'ok', { record: { costUsd: 0.4 } });
  assert.equal(quickRun(out, pool).status, 0);
  const overridden = quickRun(out, pool, ['--claude-version', '1.0.0']);
  assert.equal(overridden.status, 2);
  assert.match(overridden.stderr, /no pooled base/);
});

test('flagless runs screen the cell against the pooled base and print the verdict beside the score', () => {
  const pool = pooledBase([0.5, 0.7, 0.9]);
  const cheap = fixture();
  makeCell(cheap, 'ok', { record: { costUsd: 0.4, wallMs: 5000 } });
  const promoted = quickRun(cheap, pool);
  assert.equal(promoted.status, 0);
  assert.match(promoted.stdout, /^verdict promote$/m);
  assert.match(promoted.stdout, /"cost_usd":0.4,"durationMs":5000,"base":\{[^}]*"mean":0.7,"max":0.9\}/);
  assert.match(promoted.stdout, /^score: 2$/m);
  assert.equal(JSON.parse(promoted.stdout.split('\n').find((line) => line.startsWith('{'))).mode, 'quick');
});

test('flagless runs reject a failing cell or a cost above the base and stay silent in between', () => {
  const pool = pooledBase([0.5, 0.7, 0.9]);
  const costly = fixture();
  makeCell(costly, 'ok', { record: { costUsd: 1.2 } });
  const rejected = quickRun(costly, pool);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stdout, /^verdict reject$/m);
  const failing = fixture();
  makeCell(failing, 'bad', { record: { costUsd: 0.4, hiddenPass: false } });
  const failed = quickRun(failing, pool);
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /^FAIL bad hidden tests failed$/m);
  assert.match(failed.stdout, /^verdict reject$/m);
  const middle = fixture();
  makeCell(middle, 'ok', { record: { costUsd: 0.8 } });
  assert.match(quickRun(middle, pool).stdout, /^verdict no signal$/m);
});

test('a flagless run with no pooled base refuses before any cell and names baseline-pool.mjs add', () => {
  const empty = path.join(fixture(), 'pool.jsonl');
  fs.writeFileSync(empty, '');
  const out = fixture();
  makeCell(out, 'ok');
  const run = quickRun(out, empty);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /baseline-pool\.mjs add/);
  assert.doesNotMatch(run.stdout, /verdict/);
});
