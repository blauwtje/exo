import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { landTask } from '../skills/build/scripts/land-task.mjs';
import { git } from './harness.mjs';
import { PLAN, landingCheckout } from './land-task-fixture.mjs';

const AWS_KEY = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');
const ANTHROPIC_KEY = ['sk-', 'ant-', 'api03-abcdefghijklmnopqrstuvwxyz'].join('');

async function writeApp(root, body) {
  await fs.writeFile(path.join(root, 'src/app.js'), `export function greet() {\n  return ${body};\n}\n`);
}

test('a task whose diff adds an AWS key is refused, naming the file and the pattern', async () => {
  const { root, planPath } = await landingCheckout();
  await writeApp(root, `"${AWS_KEY}"`);
  assert.throws(
    () => landTask({ planPath, planText: PLAN, number: 1, root }),
    (error) => error.message.includes('src/app.js') && error.message.includes('"AWS access key"') && !error.message.includes(AWS_KEY)
  );
  assert.equal(git(root, 'log', '--format=%s').trim().split('\n').length, 1);
});

test('a task whose diff adds an Anthropic key is refused, naming the pattern', async () => {
  const { root, planPath } = await landingCheckout();
  await writeApp(root, `"${ANTHROPIC_KEY}"`);
  assert.throws(
    () => landTask({ planPath, planText: PLAN, number: 1, root }),
    (error) => error.message.includes('"Anthropic key"') && !error.message.includes(ANTHROPIC_KEY)
  );
});

test('a task that adds a secret in an untracked file is refused', async () => {
  const { root, planPath } = await landingCheckout();
  await fs.writeFile(path.join(root, 'src/app.js'), 'export function greet() {\n  return "hi";\n}\n');
  await fs.writeFile(path.join(root, 'src/note.md'), `key ${AWS_KEY}\n`);
  assert.throws(
    () => landTask({ planPath, planText: PLAN, number: 4, root }),
    /src\/note\.md.*AWS access key/
  );
});

test('a clean task still lands', async () => {
  const { root, planPath } = await landingCheckout();
  await writeApp(root, '"hello"');
  const output = landTask({ planPath, planText: PLAN, number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
});
