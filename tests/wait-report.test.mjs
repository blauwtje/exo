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
  assert.ok(Date.now() - started < 4000, 'timing-ok: hang guard, a refusal returns at once while a wait runs the 5 s --timeout; refusal waited for the deadline');
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  const lines = result.stderr.trim().split('\n');
  assert.equal(lines.length, 1, result.stderr);
  assert.match(lines[0], /^ERROR wait-report: .*--since \d{10} is later than now \d{10}.*Since:/);
});

const GREEN_REPORT = 'Landed: src/app.js\nProof:\n- `npm test`: pass\nUnresolved: none\n';
const BLOCKED_REPORT = 'Landed: none\nUnresolved: BLOCKED NEEDS ANSWER: which port\n';

async function stampedWait({ report, stamp }) {
  const directory = await fixture();
  const reportPath = path.join(directory, 'implementer-1.md');
  const stampPath = path.join(directory, 'checked-1');
  if (report !== undefined) await fs.writeFile(reportPath, report);
  if (stamp) await fs.writeFile(stampPath, 'Report OK\n');
  const result = await run(SCRIPT, ['--since', String(nowSeconds() - 60), '--report', reportPath, '--stamp', stampPath, '--timeout', '1']);
  return { result, reportPath };
}

test('a stamp without its report keeps the wait running', async () => {
  const { result } = await stampedWait({ stamp: true });
  assert.equal(result.code, 2);
  assert.match(result.stdout, /^waiting .*implementer-1\.md\n$/);
});

test('a BLOCKED report without a stamp ends the wait', async () => {
  const { result, reportPath } = await stampedWait({ report: BLOCKED_REPORT });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, `${reportPath}\n`);
});

test('a GREEN report without a stamp keeps the wait running', async () => {
  const { result } = await stampedWait({ report: GREEN_REPORT });
  assert.equal(result.code, 2);
});

test('a GREEN report with its stamp ends the wait', async () => {
  const { result, reportPath } = await stampedWait({ report: GREEN_REPORT, stamp: true });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, `${reportPath}\n`);
});
