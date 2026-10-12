// land-task refuses a Proof that also passes on HEAD, the commit before the task, with the
// task's test changes laid over it, unless the task names `Red: none (<reason>)`.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { landTask, LandingError } from '../skills/build/scripts/land-task.mjs';
import { compactPlanFixture, compactTask, git, gitRepository } from './harness.mjs';

// A plain script, since a nested `node --test` inherits this runner's context and exits 0 whatever it ran.
const APP_PROOF = "import { greet } from '../src/app.js';\nif (greet() !== 'hello') process.exit(1);\nconsole.log('# pass 1');\n";

async function checkout(proof, suffix = '') {
  const plan = compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof }) + suffix] });
  const root = await gitRepository({
    'src/app.js': 'export function greet() {}\n',
    'docs/plans/compact.md': plan,
    'package.json': '{ "type": "module" }\n',
    'tests/app.test.mjs': APP_PROOF,
    'tests/other.test.mjs': "console.log('# pass 1');\n"
  });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  await fs.appendFile(path.join(root, '.git/info/exclude'), '.exo/\n');
  await fs.writeFile(path.join(root, 'src/app.js'), 'export function greet() {\n  return "hello";\n}\n');
  return { root, plan, planPath: path.join(root, 'docs/plans/compact.md') };
}

const reportFor = (proof) => `Landed: src/app.js\nProof:\n- \`${proof}\`: pass\n  # pass 1\nUnresolved: none\n`;
const record = (root) => fs.readFile(path.join(root, '.exo/proof-compact-task-1.txt'), 'utf8');

test('a Proof that fails without the production change lands and the record says proved', async () => {
  const proof = 'node tests/app.test.mjs';
  const { root, plan, planPath } = await checkout(proof);
  const output = landTask({ planPath, planText: plan, number: 1, root, reportText: reportFor(proof) });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.match(await record(root), /^Red: proved$/m);
});

test('a Proof that passes on the base is refused and nothing is committed', async () => {
  const proof = 'node tests/other.test.mjs';
  const { root, plan, planPath } = await checkout(proof);
  const head = git(root, 'rev-parse', 'HEAD');
  assert.throws(
    () => landTask({ planPath, planText: plan, number: 1, root, reportText: reportFor(proof) }),
    (error) => error instanceof LandingError && /Proof passes on [0-9a-f]{7} without the production change: no red proof; tighten the test or add `Red: none \(<reason>\)` to the task/.test(error.message)
  );
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
});

test('Red: none (refactor) lands a Proof that passes on the base and the record names the reason', async () => {
  const proof = 'node tests/other.test.mjs';
  const { root, plan, planPath } = await checkout(proof, ' | Red: none (refactor)');
  const output = landTask({ planPath, planText: plan, number: 1, root, reportText: reportFor(proof) });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.match(await record(root), /^Red: skipped: none \(refactor\)$/m);
});
