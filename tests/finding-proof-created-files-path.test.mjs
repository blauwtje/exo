import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compactPlanFixture, git, run } from './harness.mjs';
import { PASS_REPORT, SCRIPT, compactCheckout, compactTask } from './land-task-fixture.mjs';

test('a Files path that the Proof creates is committed, not reported as not found', async () => {
  const proof = `node -e "require('fs').writeFileSync('gen.txt', 'x\\n')"`;
  const plan = compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'feat(app): generate', files: ['src/app.js', 'gen.txt'], proof })] });
  const { root, planPath } = await compactCheckout(plan);
  const landed = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root, '--report', '-'], { cwd: root, input: PASS_REPORT.replace('node tests/app.test.mjs', proof) });
  assert.equal(landed.code, 0, landed.stderr);
  assert.doesNotMatch(landed.stdout, /Files not found/);
  assert.match(git(root, 'show', '--name-only', '--format=', 'HEAD'), /^gen\.txt$/m);
});
