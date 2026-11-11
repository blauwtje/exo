import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { decide, formatLine, loadKinds, readLedger, recordRound, report, roundCap } from '../lib/loop-budget.mjs';
import { execFileSync } from 'node:child_process';
import { kindWallMs } from '../lib/loop-budget.mjs';
import { tempDir } from './harness.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('every kind has a cap, a progress count and an existing owner script', () => {
  for (const [kind, entry] of Object.entries(loadKinds())) {
    assert.ok(entry.cap > 0, kind);
    assert.ok(entry.progress, kind);
    assert.ok(fs.existsSync(path.join(root, entry.owner)), `${kind} owner ${entry.owner}`);
  }
  assert.equal(roundCap('refusal', {}), 2);
});

test('a kind stops at its cap and the line names the reason', () => {
  const dir = tempDir('exo-loop-');
  recordRound(dir, { kind: 'review', openAfter: 5 });
  recordRound(dir, { kind: 'review', openBefore: 5, openAfter: 3 });
  assert.equal(decide(dir, 'review', { env: {} }).verdict, 'CONTINUE');
  recordRound(dir, { kind: 'review', openBefore: 3, openAfter: 1 });
  const line = formatLine('review', decide(dir, 'review', { env: {} }));
  assert.equal(line, 'LOOP review STOP round cap 3 reached');
});

test('a round without progress is discarded and stops its kind only', () => {
  const dir = tempDir('exo-loop-');
  recordRound(dir, { kind: 'fix', openAfter: 2 });
  assert.equal(recordRound(dir, { kind: 'fix', openBefore: 2, openAfter: 2 }), 'discard');
  assert.equal(decide(dir, 'fix', { env: {} }).verdict, 'STOP');
  assert.equal(decide(dir, 'look', { env: {} }).verdict, 'CONTINUE');
});

test('the run wall and cost budgets stop every kind', () => {
  const dir = tempDir('exo-loop-');
  recordRound(dir, { kind: 'proof', openAfter: 4, wallMs: 100, costUsd: 2 });
  assert.match(decide(dir, 'look', { env: { EXO_RUN_WALL_MS: '50' } }).reason, /wall/);
  assert.match(decide(dir, 'look', { env: {}, maxRunUsd: 1 }).reason, /cost/);
  assert.equal(decide(dir, 'look', { env: {}, maxRunUsd: 5 }).verdict, 'CONTINUE');
});

test('the ledger persists rows and the report totals per kind', () => {
  const dir = tempDir('exo-loop-');
  recordRound(dir, { kind: 'fix', openAfter: 3, wallMs: 10, costUsd: 0.5 });
  recordRound(dir, { kind: 'fix', openBefore: 3, openAfter: 1, wallMs: 20, costUsd: 0.25 });
  assert.equal(readLedger(dir).length, 2);
  assert.equal(report(dir), 'kind\trounds\twall_ms\tcost_usd\nfix\t2\t30\t0.75');
});

test('an unknown kind is refused', () => {
  assert.throws(() => recordRound(tempDir('exo-loop-'), { kind: 'nope', openAfter: 1 }), /unknown loop kind/);
});

function homeWith(defaults) {
  const home = tempDir('exo-home-');
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), JSON.stringify({ defaults }));
  return home;
}

test('run.json defaults override the table and env overrides run.json', () => {
  const home = homeWith({ loopCaps: { look: 5 }, loopWallMs: { look: 7 }, repairBound: 4 });
  assert.equal(roundCap('look', { HOME: home }), 5);
  assert.equal(kindWallMs('look', { HOME: home }), 7);
  assert.equal(roundCap('review-fix', { HOME: home }), 4);
  assert.equal(roundCap('look', { HOME: home, EXO_LOOP_LOOK_CAP: '2' }), 2);
});

test('the report CLI runs and an empty open count records stop', () => {
  const dir = tempDir('exo-loop-');
  assert.equal(recordRound(dir, { kind: 'fix', openBefore: 2, openAfter: 0 }), 'stop');
  const out = execFileSync('node', [path.join(root, 'lib', 'loop-budget.mjs'), '--report', dir], { encoding: 'utf8' });
  assert.match(out, /^fix\t1/m);
});

test('pollUntil stops at the wall cap and records a wait row', async () => {
  const { pollUntil } = await import('../lib/loop-budget.mjs');
  const dir = tempDir('poll-');
  const stopped = await pollUntil(() => false, { intervalMs: 10, wallMs: 50, runDir: dir });
  assert.equal(stopped, false);
  const ready = await pollUntil(() => true, { runDir: dir });
  assert.equal(ready, true);
  assert.deepEqual(readLedger(dir).map((row) => row.kind), ['wait', 'wait']);
  assert.ok(kindWallMs('wait', {}) > 0);
});
