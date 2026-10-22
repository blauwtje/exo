import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fixture, run } from './harness.mjs';

const SCRIPT = new URL('../skills/build/scripts/wait-report.mjs', import.meta.url).pathname;

const nowSeconds = () => Math.floor(Date.now() / 1000);

test('a report written after --since is fresh and its path prints', async () => {
  const report = path.join(await fixture(), 'implementer-1.md');
  await fs.writeFile(report, 'GREEN\n');
  const result = await run(SCRIPT, ['--any', '--since', String(nowSeconds() - 60), '--report', report, '--timeout', '5']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, `${report}\n`);
});

test('a --since later than now refuses at once with one ERROR line naming the fix', async () => {
  const report = path.join(await fixture(), 'implementer-1.md');
  await fs.writeFile(report, 'GREEN\n');
  const started = Date.now();
  const result = await run(SCRIPT, ['--any', '--since', String(nowSeconds() + 64), '--report', report, '--timeout', '5']);
  assert.ok(Date.now() - started < 4000, 'refusal waited for the deadline');
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  const lines = result.stderr.trim().split('\n');
  assert.equal(lines.length, 1, result.stderr);
  assert.match(lines[0], /^ERROR wait-report: .*--since \d{10} is later than now \d{10}.*Since:/);
});
