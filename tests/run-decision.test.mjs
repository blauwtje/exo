import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inRun, recordDecision, readDecisions } from '#run-decision';

const script = path.resolve('lib/run-decision.mjs');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'run-decision-'));

test('inRun needs both variables', () => {
  assert.equal(inRun({ EXO_RUN: '1', EXO_RUN_DIR: '/x' }), true);
  assert.equal(inRun({ EXO_RUN: '1' }), false);
  assert.equal(inRun({}), false);
});

test('recordDecision appends lines and readDecisions returns them', () => {
  const dir = tmp();
  const env = { EXO_RUN: '1', EXO_RUN_DIR: dir };
  assert.deepEqual(readDecisions(dir), []);
  assert.equal(recordDecision('spec', 'A', 'cheap', env), path.join(dir, 'decisions.md'));
  recordDecision('build', 'B', 'safe', env);
  assert.deepEqual(readDecisions(dir), ['- spec: A (cheap)', '- build: B (safe)']);
});

test('recordDecision returns null outside a run', () => {
  assert.equal(recordDecision('s', 'c', 'r', {}), null);
});

test('script exits 0 in a run and 1 outside', () => {
  const dir = tmp();
  const base = { ...process.env };
  delete base.EXO_RUN;
  delete base.EXO_RUN_DIR;
  const inside = spawnSync('node', [script, 's', 'c', 'r'], { env: { ...base, EXO_RUN: '1', EXO_RUN_DIR: dir } });
  assert.equal(inside.status, 0);
  assert.deepEqual(readDecisions(dir), ['- s: c (r)']);
  const outside = spawnSync('node', [script, 's', 'c', 'r'], { env: base });
  assert.equal(outside.status, 1);
});

test('readDecisions returns [] only for a missing file and throws on another read error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-decisions-'));
  fs.mkdirSync(path.join(dir, 'decisions.md'));
  assert.throws(() => readDecisions(dir), { code: 'EISDIR' });
  fs.rmSync(dir, { recursive: true, force: true });
});
