import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { treePassMs } from '#check-cache';
import { git, run, tempDir } from './harness.mjs';
import { COMPACT_PLAN, PASS_REPORT, SCRIPT, compactCheckout } from './land-task-fixture.mjs';

const FLIP_PROOF = [
  "import fs from 'node:fs';",
  "import path from 'node:path';",
  "const marker = path.join(path.dirname(process.argv[1]), 'ran-once');",
  'if (fs.existsSync(marker)) {',
  "  console.error('✖ second run fails');",
  '  process.exit(1);',
  '}',
  "fs.writeFileSync(marker, '');",
  "console.log('# pass 3');",
  "console.log('# fail 0');",
  ''
].join('\n');

test('a Proof that passes once and would fail on a second run lands the task', async () => {
  const proofFile = path.join(tempDir(), 'flip.mjs');
  fs.writeFileSync(proofFile, FLIP_PROOF);
  const { root, planPath } = await compactCheckout(COMPACT_PLAN.replace('node tests/app.test.mjs', `node ${proofFile}`));
  const commitsBefore = Number(git(root, 'rev-list', '--count', 'HEAD').trim());
  const landed = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root, '--report', '-'], { cwd: root, input: PASS_REPORT });
  assert.equal(landed.code, 0, landed.stderr + landed.stdout);
  assert.equal(Number(git(root, 'rev-list', '--count', 'HEAD').trim()), commitsBefore + 1);
  assert.notEqual(treePassMs(root, `node ${proofFile}`), null);
});
