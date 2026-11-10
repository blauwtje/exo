import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { failedTestFiles, isNodeTest, readFlaky, recordFlaky } from '../lib/flaky-record.mjs';

test('failedTestFiles lists the failing file of a real node --test run, once', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flaky-run-'));
  fs.writeFileSync(path.join(dir, 'a.test.mjs'), "import t from 'node:test'; t('ok', () => {});");
  fs.writeFileSync(path.join(dir, 'b.test.mjs'), "import t from 'node:test'; t('bad', () => { throw new Error('no'); }); t('bad2', () => { throw new Error('no'); });");
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=spec', 'a.test.mjs', 'b.test.mjs'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
  assert.deepEqual(failedTestFiles(run.stdout + run.stderr), ['b.test.mjs']);
});

test('failedTestFiles lists the failing file of a real TAP run, relative to the cwd', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flaky-tap-')));
  fs.writeFileSync(path.join(dir, 'a.test.mjs'), "import t from 'node:test'; t('ok', () => {});");
  fs.writeFileSync(path.join(dir, 'b.test.mjs'), "import t from 'node:test'; t('bad', () => { throw new Error('no'); }); t('bad2', () => { throw new Error('no'); });");
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'a.test.mjs', 'b.test.mjs'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
  assert.deepEqual(failedTestFiles(run.stdout + run.stderr, dir), ['b.test.mjs']);
});

test('isNodeTest matches only node --test commands', () => {
  assert.equal(isNodeTest('node --test tests/a.test.mjs'), true);
  assert.equal(isNodeTest('npm test'), false);
});

test('recordFlaky counts a repeat on the same date and starts empty', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flaky-'));
  assert.deepEqual(readFlaky(root), []);
  recordFlaky(root, ['tests/a.test.mjs'], '2026-01-01');
  recordFlaky(root, ['tests/a.test.mjs'], '2026-01-01');
  recordFlaky(root, ['tests/a.test.mjs'], '2026-01-02');
  assert.deepEqual(readFlaky(root), [
    { file: 'tests/a.test.mjs', date: '2026-01-01', count: 2 },
    { file: 'tests/a.test.mjs', date: '2026-01-02', count: 1 }
  ]);
});
