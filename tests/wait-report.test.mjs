import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fixture, run } from './harness.mjs';

const SCRIPT = new URL('../skills/build/scripts/wait-report.mjs', import.meta.url).pathname;

const RUN_ENV = { EXO_RUN_SESSION: '1', EXO_WAIT_REPORT_MS: '1500' };

const nowSeconds = () => Math.floor(Date.now() / 1000);

test('a report written after --since is fresh and its path prints', async () => {
  const report = path.join(await fixture(), 'implementer-1.md');
  await fs.writeFile(report, 'GREEN\n');
  const result = await run(SCRIPT, ['--any', '--since', String(nowSeconds() - 60), '--report', report], { env: RUN_ENV });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, `${report}\nfinal\n`);
});

test('a --since later than now refuses at once with one ERROR line naming the fix', async () => {
  const report = path.join(await fixture(), 'implementer-1.md');
  await fs.writeFile(report, 'GREEN\n');
  const started = Date.now();
  const result = await run(SCRIPT, ['--any', '--since', String(nowSeconds() + 64), '--report', report], { env: RUN_ENV });
  assert.ok(Date.now() - started < 4000, 'timing-ok: hang guard, a refusal returns at once while a wait runs the deadline; refusal waited for the deadline');
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  const lines = result.stderr.trim().split('\n');
  assert.equal(lines.length, 1, result.stderr);
  assert.match(lines[0], /^ERROR wait-report: .*--since \d{10} is later than now \d{10}.*Since:/);
});

test('a non-numeric --timeout refuses with one ERROR line naming the flag and value', async () => {
  const report = path.join(await fixture(), 'implementer-1.md');
  const result = await run(SCRIPT, ['--since', String(nowSeconds() - 60), '--report', report, '--timeout', 'abc'], { env: RUN_ENV });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr.trim(), /^ERROR wait-report: .*--timeout.*abc/);
});

const GREEN_REPORT = 'Landed: src/app.js\nProof:\n- `npm test`: pass\nUnresolved: none\n';
const BLOCKED_REPORT = 'Landed: none\nUnresolved: BLOCKED NEEDS ANSWER: which port\n';

async function reportWait(report) {
  const reportPath = path.join(await fixture(), 'implementer-1.md');
  if (report !== undefined) await fs.writeFile(reportPath, report);
  const result = await run(SCRIPT, ['--since', String(nowSeconds() - 60), '--report', reportPath], { env: RUN_ENV });
  return { result, reportPath };
}

test('a missing report keeps the wait running', async () => {
  const { result } = await reportWait();
  assert.equal(result.code, 2);
  assert.match(result.stdout, /^waiting .*implementer-1\.md\n$/);
});

test('a report without a verdict line keeps the wait running', async () => {
  const { result } = await reportWait('Landed: src/app.js\n');
  assert.equal(result.code, 2);
});

test('a BLOCKED report ends the wait', async () => {
  const { result, reportPath } = await reportWait(BLOCKED_REPORT);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, `${reportPath}\nfinal\n`);
});

test('a GREEN report with a verdict line ends the wait with no stamp file', async () => {
  const { result, reportPath } = await reportWait(GREEN_REPORT);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, `${reportPath}\nfinal\n`);
});

test('outside a run session the script waits and finds a fresh report', async () => {
  const report = path.join(await fixture(), 'implementer-1.md');
  await fs.writeFile(report, 'GREEN\n');
  const result = await run(SCRIPT, ['--any', '--since', String(nowSeconds() - 60), '--report', report], { env: { EXO_WAIT_REPORT_MS: '1500' } });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, `${report}\nfinal\n`);
});

test('a fresh report with no verdict that stopped changing returns at once with the no-verdict outcome', async () => {
  const reportPath = path.join(await fixture(), 'implementer-1.md');
  await fs.writeFile(reportPath, 'Landed: src/app.js\n');
  const started = Date.now();
  const result = await run(SCRIPT, ['--since', String(nowSeconds() - 60), '--report', reportPath], { env: { ...RUN_ENV, EXO_WAIT_REPORT_MS: '30000', EXO_WAIT_SETTLE_MS: '1' } });
  assert.ok(Date.now() - started < 4000, 'timing-ok: hang guard, a settled report returns at once; waited for the deadline');
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /final\nno verdict .*implementer-1\.md\nThen: send the report back to its writer once for the verdict line/);
});
