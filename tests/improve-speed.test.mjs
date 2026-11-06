import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { contentKey } from '../benchmarks/baseline-pool.mjs';
import { NOT_SHOWN } from '../benchmarks/speed-ledger.mjs';
import { routeOf, scoreOutDir, screenIdea, verdictRecord } from '../benchmarks/improve-speed.mjs';
import { tempDir } from './harness.mjs';

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
  return tempDir('improve-speed-test-');
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

test('a gate.mjs run is read as the gate run, passing or failing', () => {
  const out = fixture();
  makeCell(out, 'pass', { gate: [bash('g1', 'node skills/gate/scripts/gate.mjs --plan p', 1), result('g1', 'PASS Task 1')] });
  makeCell(out, 'fail', { gate: [bash('g2', 'node gate.mjs', 1), result('g2', 'PASS a\nFAIL Task 2')] });
  makeCell(out, 'late', { gate: [bash('g3', 'node verify.mjs', 1), result('g3', 'FAIL Task 1'), bash('g4', 'node gate.mjs', 2), result('g4', 'PASS Task 1')] });
  const byCell = Object.fromEntries(scoreOutDir(out).rows.map((row) => [row.cell, row.failures]));
  assert.deepEqual(byCell, { pass: [], fail: ['verify gate failed'], late: [] });
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

test('cost is the mean of the record costUsd per cell and stays unscored when a finished record lacks it', () => {
  const out = fixture();
  makeCell(out, 'one', { record: { costUsd: 0.5 } });
  makeCell(out, 'two', { record: { costUsd: 0.75 } });
  const scored = scoreOutDir(out);
  assert.equal(scored.rows[0].cost, 0.5);
  assert.equal(scored.measures.cost, 0.625);
  const cell = spawnSync(process.execPath, [SCRIPT, '--from', out, '--full', '--measure', 'cost'], { encoding: 'utf8' });
  assert.match(cell.stdout, /^score: 0.625$/m);
  makeCell(out, 'three');
  const partial = scoreOutDir(out);
  assert.equal(partial.measures.cost, null);
  assert.equal(partial.spreads.cost.excluded, 1);
  assert.equal(partial.spreads.cost.n, 2);
});

test('an aborted cell is left out of every measure and the count is printed', () => {
  const out = fixture();
  makeCell(out, 'ok', { record: { costUsd: 0.5 } });
  makeCell(out, 'late', { record: { costUsd: 9, timedOut: true } });
  const { spreads, measures } = scoreOutDir(out);
  assert.equal(measures.cost, 0.5);
  assert.deepEqual([spreads.cost.n, spreads.cost.excluded, spreads.cost.se], [1, 1, null]);
  const lone = fixture();
  makeCell(lone, 'a', { record: { costUsd: 0.4 } });
  makeCell(lone, 'b', { record: { costUsd: 0.6 } });
  const run = spawnSync(process.execPath, [SCRIPT, '--from', lone, '--full', '--measure', 'cost'], { encoding: 'utf8' });
  assert.match(run.stdout, /^measure cost 0.5 se 0.100 n 2 excluded 0$/m);
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

const BASE = { commit: 'abc', n: 4, mean: 0.6, max: 0.8, costs: [0.4, 0.5, 0.7, 0.8] };
const row = (options = {}) => ({ cell: 'c', failures: [], hiddenPass: true, cost: 0.5, durationMs: 1000, ...options });
const verdictOf = (options, step = 'build-task') => verdictRecord({ row: row(options), base: BASE, step }).verdict;

test('verdictRecord is worse on a failure or a cost above the base maximum and otherwise not-shown', () => {
  assert.equal(verdictOf({ failures: ['hidden tests failed'], hiddenPass: false }), 'worse');
  assert.equal(verdictOf({ cost: 0.81 }), 'worse');
  for (const cost of [0.59, 0.7, 0.8, undefined]) assert.equal(verdictOf({ cost }), 'not-shown');
});

test('routeOf sends a flow-unit step to the pool and a fixture-only step to the screen', () => {
  assert.equal(routeOf('build-task'), 'pool');
  assert.equal(routeOf('flaky-test'), 'screen');
  assert.equal(routeOf('no-such-step'), null);
});

test('verdictRecord carries route, power line and runs needed from the pool noise', () => {
  const record = verdictRecord({ row: row(), base: BASE, step: 'build-task', runs: 5 });
  assert.equal(record.route, 'pool');
  assert.match(record.powerLine, /^power: 5 tasks x 1 samples x 2 arms = 10 runs; an effect of 0\.06 needs \d+ tasks/);
  assert.ok(Number.isInteger(record.runsNeeded) && record.runsNeeded >= 1);
  assert.deepEqual(record.base, { commit: 'abc', n: 4, mean: 0.6, max: 0.8 });
});

test('verdictRecord gives a screen route with no flow-web cost no screen and refuses an unknown step', () => {
  const record = verdictRecord({ step: 'flaky-test', screen: { runArm: () => assert.fail('no arm may run') } });
  assert.equal(record.verdict, 'not-shown');
  assert.equal(record.stopped, 'no-estimate');
  assert.equal(record.powerLine, null);
  assert.throws(() => verdictOf({}, 'no-such-step'), /no cell/);
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

test('flagless runs print the cell against the pooled base with its SE and no verdict from one cell', () => {
  const pool = pooledBase([0.5, 0.7, 0.9]);
  const cheap = fixture();
  makeCell(cheap, 'ok', { record: { costUsd: 0.4, wallMs: 5000 } });
  const screened = quickRun(cheap, pool);
  assert.equal(screened.status, 0);
  assert.match(screened.stdout, /^verdict not-shown$/m);
  assert.match(screened.stdout, /"cost_usd":0.4,"durationMs":5000,"base":\{[^}]*"se":0.115,"mean":0.7,"max":0.9\}/);
  assert.match(screened.stdout, /^base cost 0.7 se 0.115 n 3$/m);
  assert.match(screened.stdout, /^measure cost 0.4 no SE n 1 excluded 0$/m);
  assert.match(screened.stdout, /^score: 2$/m);
  assert.equal(JSON.parse(screened.stdout.split('\n').find((line) => line.startsWith('{'))).route, 'pool');
});

test('flagless runs reject a failing cell or a cost above the base and give no verdict in between', () => {
  const pool = pooledBase([0.5, 0.7, 0.9]);
  const costly = fixture();
  makeCell(costly, 'ok', { record: { costUsd: 1.2 } });
  const rejected = quickRun(costly, pool);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stdout, /^verdict worse$/m);
  const middle = fixture();
  makeCell(middle, 'ok', { record: { costUsd: 0.8 } });
  const unjudged = quickRun(middle, pool);
  assert.equal(unjudged.status, 0);
  assert.match(unjudged.stdout, /^verdict not-shown$/m);
  const failing = fixture();
  makeCell(failing, 'bad', { record: { costUsd: 0.4, hiddenPass: false } });
  const failed = quickRun(failing, pool);
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /^FAIL bad hidden tests failed$/m);
  assert.match(failed.stdout, /^verdict worse$/m);
});

test('a flagless run starts as many cells as --repeat asks and one without it', () => {
  const pool = pooledBase([0.5, 0.7, 0.9]);
  const checkout = fixture();
  const argsFile = path.join(fixture(), 'sweep-args.json');
  fs.mkdirSync(path.join(checkout, 'benchmarks'));
  fs.writeFileSync(path.join(checkout, 'benchmarks', 'sweep.mjs'), `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));\n`);
  const repeatOf = (extra) => {
    spawnSync(process.execPath, [SCRIPT, checkout, '--base', 'HEAD', '--pool', pool, ...extra], { encoding: 'utf8', env: { ...process.env, PATH: STUB_PATH } });
    const args = JSON.parse(fs.readFileSync(argsFile, 'utf8'));
    return args[args.indexOf('--repeat') + 1];
  };
  assert.equal(repeatOf(['--repeat', '3']), '3');
  assert.equal(repeatOf([]), '1');
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

const armRows = (base, candidate) => (arm, seed) => ({ pathCalls: arm === 'base' ? base[seed - 1] : candidate[seed - 1], cost: 1 });

test('a screen runs 5 seed pairs and is better when the paired proxy count drops', () => {
  const record = screenIdea({ step: 'flaky-test', runArm: armRows([10, 12, 11, 13, 12], [7, 8, 8, 9, 9]), pairCostUsd: 2, capUsd: 20 });
  assert.equal(record.route, 'screen');
  assert.equal(record.n, 5);
  assert.equal(record.pairs.length, 5);
  assert.equal(record.spendUsd, 10);
  assert.equal(record.verdict, 'better');
});

test('a screen whose estimate exceeds the cap does not start and is not-shown', () => {
  const runArm = () => assert.fail('no arm may run');
  const record = screenIdea({ step: 'flaky-test', runArm, pairCostUsd: 30, capUsd: 20 });
  assert.equal(record.verdict, 'not-shown');
  assert.equal(record.stopped, 'cap');
  assert.equal(record.pairs.length, 0);
});

test('a screen whose 5-pair estimate passes the cap does not start, and a cap of 0 turns it off', () => {
  const runArm = armRows([10, 12, 11, 13, 12], [1, 1, 1, 1, 1]);
  const partial = screenIdea({ step: 'flaky-test', runArm, pairCostUsd: 2, capUsd: 5 });
  assert.equal(partial.pairs.length, 0);
  assert.equal(partial.stopped, 'cap');
  assert.equal(partial.verdict, 'not-shown');
  const off = screenIdea({ step: 'flaky-test', runArm, pairCostUsd: 2, capUsd: 0 });
  assert.equal(off.stopped, 'off');
  assert.equal(off.pairs.length, 0);
});

test('the default cap is ideaScreenCapUsd from run defaults', () => {
  const record = screenIdea({ step: 'flaky-test', runArm: () => assert.fail('no arm may run'), pairCostUsd: 21 });
  assert.equal(record.capUsd, 20);
});

test('a screen stops in the loop when real arm costs pass the cap', () => {
  const runArm = (arm, seed) => ({ ...armRows([10, 12, 11, 13, 12], [7, 8, 8, 9, 9])(arm, seed), cost: 3 });
  const record = screenIdea({ step: 'flaky-test', runArm, pairCostUsd: 2, capUsd: 10 });
  assert.equal(record.pairs.length, 2);
  assert.equal(record.spendUsd, 12);
  assert.equal(record.stopped, 'cap');
  assert.equal(record.verdict, 'not-shown');
});

test('a screen keeps a measured zero cost and uses the estimate only for an arm with no cost', () => {
  const free = screenIdea({ step: 'flaky-test', runArm: (arm, seed) => ({ ...armRows([10, 12, 11, 13, 12], [7, 8, 8, 9, 9])(arm, seed), cost: 0 }), pairCostUsd: 2, capUsd: 20 });
  assert.equal(free.spendUsd, 0);
  const unknown = screenIdea({ step: 'flaky-test', runArm: (arm, seed) => ({ pathCalls: seed, cost: arm === 'base' ? 1 : undefined }), pairCostUsd: 2, capUsd: 20 });
  assert.equal(unknown.spendUsd, 10);
});

test('a screen whose candidate fails its checks is worse', () => {
  const runArm = (arm, seed) => ({ ...armRows([10, 12, 11, 13, 12], [7, 8, 8, 9, 9])(arm, seed), failures: arm === 'candidate' && seed === 3 ? ['hidden tests failed'] : [] });
  const record = screenIdea({ step: 'flaky-test', runArm, pairCostUsd: 2, capUsd: 20 });
  assert.equal(record.pairs.length, 5);
  assert.equal(record.verdict, 'worse');
});

test('verdictRecord screens a fixture-only step with the pair estimate and power line from flow-web costs', () => {
  const runArm = armRows([10, 12, 11, 13, 12], [7, 8, 8, 9, 9]);
  const record = verdictRecord({ step: 'flaky-test', screen: { runArm, costs: [0.8, 1.2, 1, 1], capUsd: 20 } });
  assert.equal(record.route, 'screen');
  assert.equal(record.pairCostUsd, 2);
  assert.equal(record.pairs.length, 5);
  assert.equal(record.verdict, 'better');
  assert.match(record.powerLine, /^power: 5 tasks x 1 samples x 2 arms = 10 runs; an effect of 0\.1 needs \d+ tasks/);
  assert.ok(Number.isInteger(record.runsNeeded));
});

test('not-shown is defined once, in speed-ledger.mjs', () => {
  const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'benchmarks', 'improve-speed.mjs'), 'utf8');
  assert.doesNotMatch(source, /'not-shown'/);
  assert.equal(NOT_SHOWN, 'not-shown');
});
