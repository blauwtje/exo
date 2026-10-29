import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';
import fs from 'node:fs/promises';

const RUN_PROBES = fileURLToPath(new URL('../skills/gate/scripts/run-probes.mjs', import.meta.url));

async function probes(report) {
  const root = await fixture();
  const file = path.join(root, 'report.md');
  await fs.writeFile(file, report);
  return run(RUN_PROBES, ['--report', file, '--root', root], { cwd: root });
}

test('a finding with a Probe line and no mark fails the run', async () => {
  const result = await probes('a.mjs:1; fix; broken; fix\n  Probe: true\n');
  assert.equal(result.code, 1);
  assert.match(result.stdout, /^FAIL probe \(unmarked finding[^\n]*\): a\.mjs:1/m);
});

test('a fixed finding reruns its probe and passes', async () => {
  const result = await probes('a.mjs:1; fix; broken; fix; fixed\n  Probe: true\n');
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^PASS probe \(true\)/m);
});

test('a fixed finding whose probe fails still fails', async () => {
  const result = await probes('a.mjs:1; fix; broken; fix; fixed\n  Probe: false\n');
  assert.equal(result.code, 1);
  assert.match(result.stdout, /^FAIL probe \(false\)/m);
});

test('a reported finding is skipped', async () => {
  const result = await probes('a.mjs:1; fix; broken; fix; reported: turn cap\n  Probe: false\n');
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
});

test('a passing probe appends a fixed row at the ledger round and a failing probe appends none', async () => {
  const root = await fixture();
  const ledger = path.join(root, '.exo', 'review-ledger.jsonl');
  await fs.mkdir(path.dirname(ledger));
  await fs.writeFile(ledger, `${JSON.stringify({ round: 2, rule: 'swallowed failure', path: 'a.mjs', range: '1-2', weight: 'defect', state: 'open', head: null })}\n`);
  const file = path.join(root, 'report.md');
  await fs.writeFile(file, [
    'a.mjs:1-2; defect; swallowed failure; catch drops error; fix; fixed', '  Probe: true',
    'b.mjs:4; concern; naming; vague name; fix; fixed', '  Probe: false', ''
  ].join('\n'));
  await run(RUN_PROBES, ['--report', file, '--root', root], { cwd: root });
  const rows = (await fs.readFile(ledger, 'utf8')).trim().split('\n').map((row) => JSON.parse(row));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], { round: 2, rule: 'swallowed failure', path: 'a.mjs', range: '1-2', weight: 'defect', state: 'fixed', head: null });
});

test('a fixed finding whose sweep prints output fails with the output', async () => {
  const result = await probes('a.mjs:1; fix; broken; fix; fixed\n  Probe: true\n  Class: broken\n  Sweep: echo b.mjs:7 still broken; true\n');
  assert.equal(result.code, 1);
  assert.match(result.stdout, /^FAIL probe \(sweep [^\n]*\): a\.mjs:1/m);
  assert.match(result.stdout, /^b\.mjs:7 still broken$/m);
});

test('a fixed finding whose sweep prints nothing passes even when the sweep exits 1', async () => {
  const result = await probes('a.mjs:1; fix; broken; fix; fixed\n  Probe: true\n  Class: broken\n  Sweep: grep -n "zzz[z]" report.md; false\n');
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^PASS probe \(sweep [^\n]*\): a\.mjs:1/m);
});

test('a reported finding runs no sweep', async () => {
  const result = await probes('a.mjs:1; fix; broken; fix; reported: turn cap\n  Probe: false\n  Class: broken\n  Sweep: echo hit\n');
  assert.equal(result.code, 0);
  assert.doesNotMatch(result.stdout, /sweep/);
});

test('a fixed finding with no Probe line fails and names the reported mark', async () => {
  const result = await probes('a.mjs:1; concern; broken; report | fixed\n');
  assert.equal(result.code, 1);
  assert.match(result.stdout, /^FAIL probe \(no Probe line under a fixed finding: [^\n]*reported: <reason>[^\n]*\): a\.mjs:1/m);
});

test('a fixed finding reads its Probe line after its Class and Sweep lines', async () => {
  const result = await probes('a.mjs:1; fix; broken; fix; fixed\n  Class: broken\n  Sweep: grep -n "zzz[z]" report.md\n  Probe: true\n');
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^PASS probe \(true\): a\.mjs:1/m);
  assert.match(result.stdout, /^PASS probe \(sweep [^\n]*\): a\.mjs:1/m);
  assert.doesNotMatch(result.stdout, /unmarked|Sweep:|Class:/);
});

test('a fixed finding reads its Sweep line in any position under it', async () => {
  const result = await probes('a.mjs:1; fix; broken; fix; fixed\n  Probe: true\n  Guard: none (cost)\n  Class: broken\n  Sweep: echo b.mjs:7 still broken\n');
  assert.equal(result.code, 1);
  assert.match(result.stdout, /^FAIL probe \(sweep [^\n]*\): a\.mjs:1/m);
  assert.doesNotMatch(result.stdout, /unmarked/);
});

test('a prose line with a Probe line under it in a clean section is no finding', async () => {
  const result = await probes([
    '## review-overlap', '', 'CLEAN', '',
    'Seam: the CHANGELOG line and USAGE lines agree with readout.',
    'Probe: node --test tests/delegation-readout.test.mjs → pass 17, fail 0.', '',
    'Count: defect=0 concern=0 question=0 note=0 out-of-scope=0', ''
  ].join('\n'));
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
});

test('a Probe line under prose that follows a fixed finding stays off that finding', async () => {
  const result = await probes('a.mjs:1; defect; broken; fix | fixed\n  Probe: true\nSeam: names agree.\nProbe: false\n');
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^PASS probe \(true\): a\.mjs:1/m);
  assert.doesNotMatch(result.stdout, /FAIL/);
});
