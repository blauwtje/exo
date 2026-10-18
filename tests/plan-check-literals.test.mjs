import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { compactPlanFixture, compactTask, fixture, gitRepository } from './harness.mjs';

const PLAN_CHECK = path.resolve('skills/spec/scripts/plan-check.mjs');
const FLAG = 'a path the land check cannot search';

async function planCheck(data) {
  const root = await gitRepository({ '.gitignore': '*.secret\n', 'src/run.mjs': 'export {};\n' });
  await fs.writeFile(path.join(root, 'notes.secret'), 'x\n');
  const outside = path.join(await fs.realpath(await fixture()), 'outside.txt');
  await fs.writeFile(outside, 'x\n');
  const plan = compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'Change the runner', files: ['src/run.mjs'], data: data(outside) })] });
  const planPath = path.join(await fixture(), 'plan.md');
  await fs.writeFile(planPath, plan);
  const result = spawnSync('node', [PLAN_CHECK, '--plan', planPath, '--root', root], { encoding: 'utf8' });
  return { outside, status: result.status, lines: result.stdout.split('\n').filter((line) => line.includes(FLAG)) };
}

test('a Data that names an outside path and a git-ignored path is refused on one line naming both', async () => {
  const { outside, status, lines } = await planCheck((file) => `\`${file}\` and \`notes.secret\``);
  assert.equal(status, 1);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes(`\`${outside}\``) && lines[0].includes('`notes.secret`'));
});

test('the same Data with Literals: none prints no such line', async () => {
  const { lines } = await planCheck((file) => `\`${file}\` and \`notes.secret\` | Literals: none (x)`);
  assert.deepEqual(lines, []);
});

test('a Data that names only a new name prints no such line', async () => {
  const { lines } = await planCheck(() => '`src/brand-new.mjs`, a file the change adds');
  assert.deepEqual(lines, []);
});
