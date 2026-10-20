import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { contentKey, parseRows, replayRounds, ROUNDS } from '../benchmarks/baseline-pool.mjs';

const TOOL = path.resolve('benchmarks/baseline-pool.mjs');
const [r2, r3, , , r7] = ROUNDS;
const cli = (...args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' });
const flagsOf = (round, extra = {}) => Object.entries({ commit: round.commit, cell: round.cell, model: round.model, effort: round.effort, 'claude-version': round.claudeVersion, ...extra }).flat().map(String).map((v, i) => (i % 2 === 0 ? `--${v}` : v));

test('the key ignores the commit hash and changes with a keyed file or a setting', () => {
  assert.equal(contentKey(r2), contentKey(r3));
  assert.notEqual(contentKey(r2), contentKey(r7));
  assert.notEqual(contentKey(r2), contentKey({ ...r2, effort: 'low' }));
  assert.match(contentKey(r2), /^[0-9a-f]{64}$/);
});

test('parseRows reads the rows of the arm and ignores other tables', () => {
  const text = '| run | cost $ |\n|---|---|\n| base-1 | 0.5 |\n| new-1 | 0.9 |\n| base-2 | 0.7 |\n';
  assert.deepEqual(parseRows(text, 'base-').map((row) => row['cost $']), [0.5, 0.7]);
});

test('replay over the committed rounds matches three pairs and every matched pair passes', () => {
  const { pairs, saved, ok } = replayRounds();
  assert.equal(pairs.length, 15);
  assert.equal(pairs.filter((pair) => pair.match).length, 3);
  assert.ok(ok);
  assert.equal(saved.find((round) => round.round === 'r2').usd, 0);
  assert.ok(saved.find((round) => round.round === 'r3').usd > 9);
});

test('lookup refuses wall and an unknown metric with exit 2', () => {
  for (const metric of ['wall', 'lead calls']) {
    const result = cli('lookup', ...flagsOf(r2), '--metric', metric);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /-28%/);
  }
});

test('add stores a row, lookup then hits for cost and a later round, and add refuses an unknown version', () => {
  const pool = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pool-')), 'pool.jsonl');
  const extra = { results: r2.results, arm: r2.arm, pool };
  assert.equal(cli('lookup', ...flagsOf(r2, { pool, metric: 'cost' })).status, 1);
  assert.equal(cli('add', ...flagsOf(r2, extra)).status, 0);
  const rows = fs.readFileSync(pool, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual([rows.length, rows[0].n, rows[0].date, rows[0].key], [1, 5, '2026-10-19', contentKey(r2)]);
  assert.equal(cli('add', ...flagsOf(r2, extra)).status, 0);
  assert.equal(fs.readFileSync(pool, 'utf8').trim().split('\n').length, 1);
  const hit = cli('lookup', ...flagsOf(r3, { pool, metric: 'tokens' }));
  assert.equal(hit.status, 0);
  assert.equal(JSON.parse(hit.stdout).arm, 'base-');
  const unknown = cli('add', '--commit', r2.commit, '--cell', r2.cell, '--model', r2.model, '--effort', r2.effort, '--results', r2.results, '--arm', r2.arm, '--pool', pool);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /claude-version/);
});

test('replay refuses a round whose arm parses no rows instead of passing it on p=1', () => {
  const broken = ROUNDS.map((round) => ({ ...round }));
  broken[0].arm = 'absent-';
  assert.throws(() => replayRounds(broken), /absent-/);
});

test('the wall refusal and the README do not claim rounds 7 and 8 ran on the same code', () => {
  const refusal = cli('lookup', ...flagsOf(r2), '--metric', 'wall');
  assert.equal(refusal.status, 2);
  assert.doesNotMatch(refusal.stderr, /same code/);
  assert.doesNotMatch(fs.readFileSync('benchmarks/README.md', 'utf8'), /on the same code/);
});

test('the L3.3 ledger row cites the baseline-pool results and the replay pair count', () => {
  const row = fs.readFileSync('benchmarks/speed-ledger.jsonl', 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)).find((r) => r.id === 'l3-3-content-keyed-baseline-pool');
  assert.equal(row.results, 'benchmarks/results/2026-10-20-baseline-pool.md');
  const matched = replayRounds().pairs.filter((pair) => pair.match).length;
  assert.match(row.measured, new RegExp(`${matched} matched pairs`));
});

test('each round records the Claude Code version its results file names, when it names one', () => {
  for (const round of ROUNDS.filter((entry) => entry.results !== 'benchmarks/results/2026-10-20-baseline-pool.md')) {
    const named = fs.readFileSync(round.results, 'utf8').match(/claude (\d+\.\d+\.\d+)/);
    if (named) assert.equal(round.claudeVersion, named[1], round.round);
  }
});
