// land-task refuses a task whose added code carries a comment or breaks the nesting and
// parameter limits, and lets the same task land once the code is clean.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { checkCodeRules, checkTask, landTask, LandingError } from '../skills/build/scripts/land-task.mjs';
import { compactPlanFixture, compactTask, git, gitRepository } from './harness.mjs';

const APP_PROOF = "import { greet } from '../src/app.js';\nif (greet() !== 'hello') process.exit(1);\nconsole.log('# pass 1');\n";
const PROOF = 'node tests/app.test.mjs';
const CLEAN = 'export function greet() {\n  return "hello";\n}\n';
const COMMENTED = '// say hello\nexport function greet() {\n  return "hello";\n}\n';
const DEEP = 'export function greet() {\n  const a = 2;\n  if (a) {\n    if (a > 1) {\n      for (const x of [a]) {\n        return "hello";\n      }\n    }\n  }\n  return "hello";\n}\n';
const WIDE = `export function greet(${['a', 'b', 'c', 'd'].join(', ')}) {\n  return "hello";\n}\n`;
const LAND_TASK = path.resolve('skills/build/scripts/land-task.mjs');
const LONG =`export function greet() {\n${Array.from({ length: 25 }, (_, i) => `  const a${i} = ${i};\n`).join('')}  return "hello";\n}\n`;

async function checkout(source) {
  const plan = compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: PROOF })] });
  const root = await gitRepository({
    'src/app.js': 'export function greet() {}\n',
    'docs/plans/compact.md': plan,
    'package.json': '{ "type": "module" }\n',
    'tests/app.test.mjs': APP_PROOF
  });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  await fs.appendFile(path.join(root, '.git/info/exclude'), '.exo/\n');
  await fs.writeFile(path.join(root, 'src/app.js'), source);
  return { root, plan, planPath: path.join(root, 'docs/plans/compact.md') };
}

const reportText = `Landed: src/app.js\nProof:\n- \`${PROOF}\`: pass\n  # pass 1\nUnresolved: none\n`;

test('a task that adds a comment is refused with the line and an instruction, and nothing is committed', async () => {
  const { root, plan, planPath } = await checkout(COMMENTED);
  const head = git(root, 'rev-parse', 'HEAD');
  assert.throws(
    () => landTask({ planPath, planText: plan, number: 1, root, reportText }),
    (error) => error instanceof LandingError && /src\/app\.js:1 comment/.test(error.message) && /Remove the comment or make the code clearer\./.test(error.message)
  );
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
});

test('checkTask refuses the same comment', async () => {
  const { root, plan, planPath } = await checkout(COMMENTED);
  assert.throws(
    () => checkTask({ planPath, planText: plan, number: 1, root, reportText }),
    (error) => error instanceof LandingError && /src\/app\.js:1 comment/.test(error.message)
  );
});

test('the same task without the comment lands', async () => {
  const { root, plan, planPath } = await checkout(CLEAN);
  const output = landTask({ planPath, planText: plan, number: 1, root, reportText });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
});

test('nesting deeper than 2 is refused', async () => {
  const { root, plan, planPath } = await checkout(DEEP);
  assert.throws(
    () => landTask({ planPath, planText: plan, number: 1, root, reportText }),
    (error) => error instanceof LandingError && /src\/app\.js:\d+ max-depth/.test(error.message)
  );
});

test('a refusal for one rule also names the parameter limit, so a retry does not trade depth for parameters', async () => {
  const { root, plan, planPath } = await checkout(DEEP);
  assert.throws(
    () => landTask({ planPath, planText: plan, number: 1, root, reportText }),
    (error) => error instanceof LandingError && /at most 3 parameters/.test(error.message) && /at most 2 deep/.test(error.message)
  );
});

test('a function over 20 lines only warns and the task lands', async () => {
  const { root, plan, planPath } = await checkout(LONG);
  const output = landTask({ planPath, planText: plan, number: 1, root, reportText });
  assert.match(output, /^Code rule warning: src\/app\.js:1 max-lines-per-function/m);
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
});

function runCodeRulesCli({ root, planPath }) {
  const env = { ...process.env };
  delete env.EXO_RUN_TASK;
  return spawnSync('node', [LAND_TASK, '--code-rules', '--plan', planPath, '--task', '1', '--root', root], { encoding: 'utf8', env });
}

test('--code-rules exits 1 with the max-params finding on a seeded 4-parameter function', async () => {
  const { root, planPath } = await checkout(WIDE);
  const result = runCodeRulesCli({ root, planPath });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /src\/app\.js:\d+ max-params/);
});

test('--code-rules prints Code rules OK on clean code and needs no report', async () => {
  const { root, planPath } = await checkout(CLEAN);
  const result = runCodeRulesCli({ root, planPath });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^Code rules OK: Task 1$/m);
});

test('checkCodeRules refuses a task outside the pin', async () => {
  const { root, plan, planPath } = await checkout(CLEAN);
  assert.throws(
    () => checkCodeRules({ planPath, planText: plan, number: 1, root, pin: { planId: 'other', number: 1 } }),
    (error) => error instanceof LandingError && /EXO_RUN_TASK pins this run/.test(error.message)
  );
});
