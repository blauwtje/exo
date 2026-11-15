import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { tempDir } from './harness.mjs';

const PLAN_TEMPLATE = path.resolve('skills/spec/scripts/plan-template.mjs');

test('each done-list command lands once in the Success criterion', () => {
  const root = tempDir('plan-template-');
  fs.mkdirSync(path.join(root, 'docs', 'plans'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'plans', 'definition-of-done.md'), '- `npm run lint`\n- `npm test`\n');
  const plan = path.join(root, 'plan.md');
  fs.writeFileSync(plan, '## Success criterion\n`npm test` passes.\n');
  for (let round = 0; round < 2; round += 1) {
    const result = spawnSync('node', [PLAN_TEMPLATE, 'done', '--root', root, '--plan', plan], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  assert.equal(fs.readFileSync(plan, 'utf8'), '## Success criterion\n`npm test && npm run lint` passes.\n');
});
