// Pins wait-report.mjs, the bounded wait a run-unit makes for build-task
// reports when the harness backgrounds the dispatch: a report counts only when
// it exists, is non-empty and is no older than the dispatch start.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const SCRIPT = new URL('../skills/build/scripts/wait-report.mjs', import.meta.url).pathname;

function waitReport(args) {
  return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
}

function reportDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wait-report-'));
}

test('a fresh report exits 0 and prints its path at once', () => {
  const dir = reportDir();
  const report = path.join(dir, 'implementer-1.md');
  fs.writeFileSync(report, 'GREEN\n');
  const since = Math.floor(Date.now() / 1000) - 5;
  const run = waitReport(['--since', String(since), '--report', report, '--timeout', '2']);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), report);
});

test('a report older than the start time never counts: exit 2 naming it at the deadline', () => {
  const dir = reportDir();
  const report = path.join(dir, 'implementer-1.md');
  fs.writeFileSync(report, 'GREEN\n');
  const old = new Date(Date.now() - 3600 * 1000);
  fs.utimesSync(report, old, old);
  const since = Math.floor(Date.now() / 1000);
  const run = waitReport(['--since', String(since), '--report', report, '--timeout', '1']);
  assert.equal(run.status, 2);
  assert.equal(run.stdout.trim(), `waiting ${report}`);
});

test('a missing report times out with exit 2 while a fresh sibling is not listed', () => {
  const dir = reportDir();
  const fresh = path.join(dir, 'implementer-1.md');
  const missing = path.join(dir, 'implementer-2.md');
  fs.writeFileSync(fresh, 'GREEN\n');
  const since = Math.floor(Date.now() / 1000) - 5;
  const run = waitReport(['--since', String(since), '--report', fresh, '--report', missing, '--timeout', '1']);
  assert.equal(run.status, 2);
  assert.equal(run.stdout.trim(), `waiting ${missing}`);
});

test('bad arguments exit 1', () => {
  assert.equal(waitReport(['--report', '/tmp/x']).status, 1);
  assert.equal(waitReport(['--since', 'soon', '--report', '/tmp/x']).status, 1);
  assert.equal(waitReport(['--since', '1']).status, 1);
});

test('--any exits 0 at once printing only the fresh report', () => {
  const dir = reportDir();
  const fresh = path.join(dir, 'implementer-1.md');
  const missing = path.join(dir, 'implementer-2.md');
  fs.writeFileSync(fresh, 'GREEN\n');
  const since = String(Math.floor(Date.now() / 1000) - 5);
  const run = waitReport(['--any', '--since', since, '--report', missing, '--report', fresh, '--timeout', '2']);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), fresh);
});

test('--any with no fresh report exits 2 naming all', () => {
  const dir = reportDir();
  const missing = path.join(dir, 'implementer-2.md');
  const run = waitReport(['--any', '--since', '1', '--report', missing, '--timeout', '1']);
  assert.equal(run.status, 2);
  assert.equal(run.stdout.trim(), `waiting ${missing}`);
});

test('--since per report pairs in order: a report older than its own slot start is stale', () => {
  const dir = reportDir();
  const one = path.join(dir, 'implementer-1.md');
  const two = path.join(dir, 'implementer-2.md');
  fs.writeFileSync(one, 'GREEN\n');
  fs.writeFileSync(two, 'GREEN\n');
  const now = Math.floor(Date.now() / 1000);
  const run = waitReport(['--any', '--since', String(now - 5), '--since', String(now + 3600),
    '--report', one, '--report', two, '--timeout', '1']);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), one);
  const stale = waitReport(['--since', String(now - 5), '--since', String(now + 3600),
    '--report', one, '--report', two, '--timeout', '1']);
  assert.equal(stale.status, 2);
  assert.equal(stale.stdout.trim(), `waiting ${two}`);
});

test('a --since count matching neither one nor the report count exits 1', () => {
  assert.equal(waitReport(['--since', '1', '--since', '2', '--report', '/tmp/x']).status, 1);
});
