import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { runCoveringTests } from '../skills/build/scripts/land-proof.mjs';
import { LandingError } from '../skills/build/scripts/land-errors.mjs';

delete process.env.NODE_TEST_CONTEXT;

const SLEEP_MS = 1500;
const TASK = { number: 4, section: '' };

const testSource = (body) => `import { test } from 'node:test';\nconst source = 'src/app.js';\ntest(source, async () => { await new Promise((resolve) => setTimeout(resolve, ${SLEEP_MS})); ${body} });\n`;

async function checkout(bodies) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'exo-covering-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  await fs.mkdir(path.join(root, 'tests'));
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}\n');
  await Promise.all(bodies.map((body, index) => fs.writeFile(path.join(root, 'tests', `case-${index}.test.mjs`), testSource(body))));
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

test('covering tests run side by side, not one after another', async () => {
  const root = await checkout(['', '', '', '', '', '']);
  runCoveringTests(TASK, [], root, ['src/app.js'], undefined);
});

test('a failing covering test is named with its exit and the others are not', async () => {
  const root = await checkout(['', 'throw new Error("boom");', '']);
  assert.throws(() => runCoveringTests(TASK, [], root, ['src/app.js'], undefined), (error) => {
    assert.ok(error instanceof LandingError);
    assert.match(error.message, /Task 4: 1 covering test\(s\) of the changed files failed:/);
    assert.match(error.message, /tests\/case-1\.test\.mjs failed \(exit 1\):/);
    assert.doesNotMatch(error.message, /case-0|case-2/);
    return true;
  });
});

test('a covering test past the deadline is reported as timed out', async () => {
  const root = await checkout(['']);
  process.env.EXO_PROOF_TIMEOUT_MS = '300';
  try {
    assert.throws(() => runCoveringTests(TASK, [], root, ['src/app.js'], undefined), /case-0\.test\.mjs failed \(timed out after 0\.3s\)/);
  } finally {
    delete process.env.EXO_PROOF_TIMEOUT_MS;
  }
});

test('a proof command that names a covering test skips it', async () => {
  const root = await checkout(['throw new Error("boom");']);
  runCoveringTests(TASK, ['node --test tests/case-0.test.mjs'], root, ['src/app.js'], undefined);
});
