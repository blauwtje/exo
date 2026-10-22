import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';
import fs from 'node:fs/promises';

const RUN_PROBES = fileURLToPath(new URL('../skills/verify/scripts/run-probes.mjs', import.meta.url));

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
