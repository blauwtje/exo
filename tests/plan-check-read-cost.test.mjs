// A task's Files: are read through Read, which costs about 2 bytes per token,
// so plan-check must flag a task whose text plus Files: pass 50 kB.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { planCheckReport } from '../skills/spec/scripts/plan-check.mjs';
import * as harness from './harness.mjs';

const { compactPlanFixture, compactTask } = harness;
const withLand = (plan) => plan.replace(/^(Branch: .+)$/m, '$1\nLand: local');

test('plan-check flags a task whose text and Files: pass 50 kB', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-read-cost-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'over.js'), 'x'.repeat(60_000));
  fs.writeFileSync(path.join(root, 'src', 'under.js'), 'x'.repeat(30_000));
  const report = (file) => planCheckReport(withLand(compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'feat(app): greet', files: [file], proof: 'node --test tests/app.test.mjs' })] })), { root });
  const over = report('src/over.js');
  assert.equal(over.ok, false);
  assert.ok(over.lines.some((line) => line.includes('Task 1: split Task 1') && line.includes('tokens')), over.lines.join('; '));
  const under = report('src/under.js');
  assert.equal(under.ok, true, under.lines.join('; '));
});
