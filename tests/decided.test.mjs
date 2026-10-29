import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareValueRepo } from '../benchmarks/value.mjs';
import { countQuestions, loadFixtures, passesCheck, parseArguments, planCells, selectFixtures, spendCap, summarize, targetVerdict } from '../benchmarks/decided.mjs';

const FIXTURES = loadFixtures();

function streamOf(...messages) {
  return messages.map((message) => JSON.stringify(message)).join('\n');
}

function ask() {
  return { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'AskUserQuestion', input: {} }] } };
}

function cell(questions, defaultPass, extra = {}) {
  return { questions, defaultPass, alternativePass: false, reversed: false, ...extra };
}

test('quick is the default: one train task, two arms, one run', () => {
  const options = parseArguments([]);
  const cells = planCells(selectFixtures(FIXTURES, options), options.arms, options.runs);
  assert.equal(cells.length, 2);
  assert.deepEqual(options.arms, ['exo-before', 'exo']);
  assert.equal(spendCap(options, cells), 2);
  assert.equal(options.maxBudgetUsd, 1.5);
});

test('--full and --split refuse --runs below 3', () => {
  assert.throws(() => parseArguments(['--full', '--runs', '2']), /at least 3/);
  assert.throws(() => parseArguments(['--split', 'held-out', '--runs', '1']), /at least 3/);
  assert.equal(parseArguments(['--split', 'held-out']).runs, 3);
  assert.throws(() => parseArguments(['--split', 'other']), /--split/);
  assert.throws(() => parseArguments(['--nope']), /unknown argument/);
});

test('there are 4 train and 2 held-out fixtures, each with both solutions and hidden checks', () => {
  assert.equal(FIXTURES.filter((fixture) => fixture.split === 'train').length, 4);
  assert.equal(FIXTURES.filter((fixture) => fixture.split === 'held-out').length, 2);
  for (const fixture of FIXTURES) {
    for (const name of ['seed', 'hidden-default', 'hidden-alternative', 'solution-default', 'solution-alternative', 'check.mjs', 'prompt.md']) {
      assert.ok(fs.existsSync(path.join(fixture.directory, name)), `${fixture.id} lacks ${name}`);
    }
  }
});

test('a question is an AskUserQuestion call or a final reply line ending in ?', () => {
  const result = { type: 'result', result: 'Done.\nShould I use tabs?\nWhat about CRLF?', session_id: 'abc' };
  assert.equal(countQuestions(streamOf(ask(), ask(), result)), 4);
  assert.equal(countQuestions(streamOf({ type: 'result', result: 'Done.' })), 0);
  assert.equal(countQuestions('not json\n'), 0);
});

test('a recorded stream-json turn with one AskUserQuestion call and one final question line counts 2', () => {
  const recorded = fs.readFileSync(new URL('./fixtures/decided-stream.jsonl', import.meta.url), 'utf8');
  assert.equal(countQuestions(recorded), 2);
});

test('a scoring copy is gone once its verdict is read', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'decided-scoring-'));
  const fixture = FIXTURES[0];
  const repo = path.join(root, 'repo');
  const scratch = path.join(root, 'scoring');
  const startTree = prepareValueRepo(fixture, repo);
  await passesCheck({ fixture, mode: 'default', repo, startTree, scratch });
  await passesCheck({ fixture, mode: 'alternative', repo, startTree, scratch });
  const left = fs.readdirSync(scratch);
  fs.rmSync(root, { recursive: true, force: true });
  assert.deepEqual(left, []);
});

test('the four rates', () => {
  const summary = summarize([cell(0, true, { reversed: true }), cell(0, false, { alternativePass: true }), cell(2, false, { alternativePass: true }), cell(0, true)]);
  assert.equal(summary.meanQuestions, 0.5);
  assert.equal(summary.hiddenPassRate, 0.5);
  assert.equal(summary.wrongDefaultRate, 0.25);
  assert.equal(summary.reversalRate, 0.25);
});

test('the target needs half the exo-before mean and a fall, with the hidden pass rate kept', () => {
  const before = [3, 3, 4, 3, 4, 3].map((questions) => cell(questions, true));
  const fewer = [0, 1, 0, 1, 0, 1].map((questions) => cell(questions, true));
  const slightlyFewer = [2, 2, 2, 3, 2, 3].map((questions) => cell(questions, true));
  const failing = [0, 1, 0, 1, 0, 1].map((questions, index) => cell(questions, index < 1));
  assert.equal(targetVerdict(before, fewer).met, true);
  assert.equal(targetVerdict(before, slightlyFewer).met, false);
  assert.equal(targetVerdict(before, failing).met, false);
  assert.equal(targetVerdict(fewer.map((entry) => ({ ...entry, questions: 0 })), fewer).note, 'exo-before asks no questions');
});

function checkVerdict(fixture, solution, checked) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'decided-fixture-'));
  fs.cpSync(path.join(fixture.directory, 'seed'), repo, { recursive: true });
  fs.cpSync(path.join(fixture.directory, `solution-${solution}`), repo, { recursive: true });
  fs.cpSync(path.join(fixture.directory, `hidden-${checked}`), repo, { recursive: true });
  const run = spawnSync(process.execPath, [path.join(fixture.directory, 'check.mjs'), repo, checked], { encoding: 'utf8' });
  fs.rmSync(repo, { recursive: true, force: true });
  return JSON.parse(run.stdout).pass;
}

test('each fixture passes its own mode and fails the other', () => {
  const modes = ['default', 'alternative'];
  const pairs = modes.flatMap((solution) => modes.map((checked) => ({ solution, checked })));
  for (const fixture of FIXTURES) {
    for (const { solution, checked } of pairs) {
      assert.equal(checkVerdict(fixture, solution, checked), solution === checked, `${fixture.id} solution-${solution} against ${checked}`);
    }
  }
});

test('turn 2 is judged only when turn 1 listed the default as item 1 under the Decided heading', async () => {
  const { listsDefaultFirst } = await import('../benchmarks/decided.mjs');
  const result = (text) => streamOf({ type: 'result', result: text });
  assert.equal(listsDefaultFirst(result('Done.\n\n**Decided for you**\n1. kept 0-based; reply `1` for 1-based')), true);
  assert.equal(listsDefaultFirst(result('Done.\n\n1. kept 0-based; reply `1` for 1-based')), false);
  assert.equal(listsDefaultFirst(result('**Decided for you**\n2. kept 0-based')), false);
  assert.equal(listsDefaultFirst(streamOf()), false);
});

test('the default spend cap covers a full and a held-out dry run', () => {
  for (const args of [['--full'], ['--split', 'held-out', '--runs', '3']]) {
    const run = spawnSync('node', ['benchmarks/decided.mjs', ...args, '--dry-run'], { encoding: 'utf8' });
    const match = run.stdout.match(/projected \$([0-9.]+).*cap \$([0-9.]+)/);
    assert.ok(Number(match[2]) >= Number(match[1]), run.stdout);
  }
});

test('the default full cap is the runnable cell count times the cell estimate, and an explicit cap wins', () => {
  const full = parseArguments(['--full']);
  assert.equal(spendCap(full, new Array(48).fill({})), 28.8);
  assert.equal(spendCap(full, new Array(36).fill({})), 21.6);
  assert.equal(spendCap(parseArguments(['--full', '--max-total-usd', '5']), new Array(48).fill({})), 5);
});

test('a nonzero gap between two arms with sd 0 counts by its sign, a zero gap stays noise', () => {
  const steady = (questions) => [questions, questions, questions].map((count) => cell(count, true));
  assert.equal(targetVerdict(steady(3), steady(0)).verdict, 'fall');
  assert.equal(targetVerdict(steady(3), steady(0)).met, true);
  assert.equal(targetVerdict(steady(2), steady(4)).verdict, 'rise');
  assert.equal(targetVerdict(steady(3), steady(3)).verdict, 'noise');
  const failing = [0, 0, 0].map((count) => cell(count, false));
  assert.equal(targetVerdict(steady(3), failing).guardVerdict, 'fall');
  assert.equal(targetVerdict(steady(3), failing).met, false);
});
