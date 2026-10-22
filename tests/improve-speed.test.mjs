import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scoreOutDir } from '../benchmarks/improve-speed.mjs';

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

test('the command prints score on a good out dir and exits 1 with FAIL lines otherwise', () => {
  const out = fixture();
  makeCell(out, 'ok');
  const good = spawnSync(process.execPath, [SCRIPT, '--from', out, '--measure', 'calls'], { encoding: 'utf8' });
  assert.equal(good.status, 0);
  assert.match(good.stdout, /^score: 2$/m);
  makeCell(out, 'bad', { record: { hiddenPass: false } });
  const bad = spawnSync(process.execPath, [SCRIPT, '--from', out], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /^FAIL bad hidden tests failed$/m);
  assert.doesNotMatch(bad.stdout, /score:/);
  const empty = spawnSync(process.execPath, [SCRIPT, '--from', fixture()], { encoding: 'utf8' });
  assert.equal(empty.status, 1);
  assert.match(empty.stdout, /FAIL no cells/);
});

test('an unknown measure exits 2 and starts no sweep', () => {
  const run = spawnSync(process.execPath, [SCRIPT, '--from', fixture(), '--measure', 'wall'], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /usage:/);
});
