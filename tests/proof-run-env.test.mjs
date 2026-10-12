// A task's Proof and the red-green run on the base commit see none of the run variables, so a test the
// Proof starts inside `exo run` never reads the live run's state and parks no gates in it.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { landTask } from '../skills/build/scripts/land-task.mjs';
import { RUN_VARIABLES as HELPER_VARIABLES } from './clean-run-env.mjs';
import * as processTree from '#process-tree';
import { compactPlanFixture, compactTask, git, gitRepository } from './harness.mjs';

const LEAKED = { EXO_RUN: 'live-run', EXO_RUN_TASK: 'plan/9', EXO_DROPS: 'not in skills/x.md' };

test('the run variables lib strips are the ones the test helper strips', () => {
  assert.deepEqual([...processTree.RUN_VARIABLES].sort(), [...HELPER_VARIABLES].sort());
});

test('a Proof and its red-green base run see none of the run variables', async () => {
  const seen = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'proof-run-env-')), 'seen.txt');
  const script = [
    "import fs from 'node:fs';",
    "import { greet } from '../src/app.js';",
    `const leaked = ${JSON.stringify(Object.keys(LEAKED))}.concat(['EXO_RUN_DIR']).filter((name) => process.env[name] !== undefined);`,
    `fs.appendFileSync(${JSON.stringify(seen)}, \`leaked:\${leaked.join(',')}\\n\`);`,
    'if (leaked.length > 0 || greet() !== "hello") process.exit(1);',
    "console.log('# pass 1');",
    ''
  ].join('\n');
  const proof = 'node tests/app.test.mjs';
  const plan = compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof })] });
  const root = await gitRepository({
    'src/app.js': 'export function greet() {}\n',
    'docs/plans/compact.md': plan,
    'package.json': '{ "type": "module" }\n',
    'tests/app.test.mjs': script
  });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  await fs.appendFile(path.join(root, '.git/info/exclude'), '.exo/\n');
  await fs.writeFile(path.join(root, 'src/app.js'), 'export function greet() {\n  return "hello";\n}\n');
  const saved = Object.fromEntries(HELPER_VARIABLES.map((name) => [name, process.env[name]]));
  Object.assign(process.env, LEAKED, { EXO_RUN_DIR: await fs.mkdtemp(path.join(os.tmpdir(), 'proof-run-dir-')) });
  try {
    const reportText = `Landed: src/app.js\nProof:\n- \`${proof}\`: pass\n  # pass 1\nUnresolved: none\n`;
    const output = landTask({ planPath: path.join(root, 'docs/plans/compact.md'), planText: plan, number: 1, root, reportText });
    assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  const lines = (await fs.readFile(seen, 'utf8')).trim().split('\n');
  assert.ok(lines.length >= 2, `Proof and base run both recorded: ${lines}`);
  assert.deepEqual([...new Set(lines)], ['leaked:']);
});
