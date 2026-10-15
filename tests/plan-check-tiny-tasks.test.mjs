import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { planCheckReport } from '../skills/spec/scripts/plan-check.mjs';
import * as harness from './harness.mjs';

const { compactPlanFixture, compactTask } = harness;
const withLand = (plan) => plan.replace(/^(Branch: .+)$/m, '$1\nLand: local\nCommit: feat(fixture): add the fixture');

function reportFor(files, sizes) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-tiny-'));
  fs.mkdirSync(path.join(root, 'src'));
  for (const [name, bytes] of Object.entries(sizes)) fs.writeFileSync(path.join(root, 'src', name), 'x'.repeat(bytes));
  const tasks = files.map((file, index) => compactTask({
    number: index + 1,
    title: `feat(app): step ${index + 1}`,
    dependsOn: index === 0 ? 'none' : `Task ${index}`,
    files: [file],
    proof: 'node --test tests/app.test.mjs'
  }));
  return planCheckReport(withLand(compactPlanFixture({ tasks })), { root });
}

const warningsOf = (report) => report.lines.filter((line) => line.startsWith('warning:'));

test('plan-check warns on two adjacent tiny tasks that share a file and a chain', () => {
  const report = reportFor(['src/a.js', 'src/a.js'], { 'a.js': 100 });
  assert.equal(report.ok, true, report.lines.join('; '));
  assert.equal(warningsOf(report).length, 1, report.lines.join('; '));
  assert.match(warningsOf(report)[0], /Task 1 and Task 2 are both tiny/);
});

test('plan-check does not warn when the tasks share no file', () => {
  const report = reportFor(['src/a.js', 'src/b.js'], { 'a.js': 100, 'b.js': 100 });
  assert.equal(report.ok, true, report.lines.join('; '));
  assert.deepEqual(warningsOf(report), []);
});

test('plan-check does not warn when the shared file is over the tiny bar', () => {
  const report = reportFor(['src/a.js', 'src/a.js'], { 'a.js': 30_000 });
  assert.deepEqual(warningsOf(report), []);
});
