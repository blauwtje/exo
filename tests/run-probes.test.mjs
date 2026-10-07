// run-probes.mjs reruns the Probe line under each finding the fixer marked `fixed`
// and fails on any probe that still exits non-zero.

import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { fixedProbes } from '../skills/verify/scripts/run-probes.mjs';
import { fixture, run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/verify/scripts/run-probes.mjs', import.meta.url));

async function probeRun(report) {
  const root = await fixture();
  const reportPath = path.join(root, 'report.md');
  await writeFile(reportPath, report);
  return run(SCRIPT, ['--report', reportPath, '--root', root], { cwd: root });
}

test('fixedProbes reads only findings ending fixed', () => {
  const report = [
    'FINDINGS',
    'a.js:1-2; defect; rule; evidence; fix; fixed',
    '  Probe: test -f a.js',
    'b.js:3-4; hazard; rule; evidence; fix; reported: needs c.js',
    '  Probe: test -f b.js',
    'c.js:5-6; defect; rule; evidence; fix; fixed'
  ].join('\n');
  assert.deepEqual(fixedProbes(report), [
    { finding: 'a.js:1-2; defect; rule; evidence; fix; fixed', command: 'test -f a.js' },
    { finding: 'c.js:5-6; defect; rule; evidence; fix; fixed', command: null }
  ]);
});

test('passes when every fixed probe exits 0, and skips a reported finding', async () => {
  const result = await probeRun('a.js:1; defect; r; e; fix; fixed\n  Probe: true\nb.js:2; defect; r; e; fix; reported: x\n  Probe: false\n');
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^PASS probe \(true\)/);
  assert.doesNotMatch(result.stdout, /false/);
});

test('fails with the probe output when a fixed probe still exits non-zero', async () => {
  const result = await probeRun('a.js:1; defect; r; e; fix; fixed\n  Probe: echo still broken >&2; exit 3\n');
  assert.equal(result.code, 1);
  assert.match(result.stdout, /^FAIL probe \(echo still broken >&2; exit 3\)/);
  assert.match(result.stdout, /still broken/);
});

test('fails a fixed finding that has no Probe line', async () => {
  const result = await probeRun('a.js:1; defect; r; e; fix; fixed\n');
  assert.equal(result.code, 1);
  assert.match(result.stdout, /no Probe line/);
});

test('prints nothing and passes with no fixed finding', async () => {
  const result = await probeRun('CLEAN\n');
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
});

test('exits 2 without --report', async () => {
  const result = await run(SCRIPT, []);
  assert.equal(result.code, 2);
});
