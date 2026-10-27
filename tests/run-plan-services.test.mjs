import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, git, gitRepository, run } from './harness.mjs';

const RUN_PLAN = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));

const planText = (root) => [
  '# Plan: services fixture', '', '## Goal', 'One file.', '',
  '## Plan basis', `Repository: ${root}`, 'Branch: feat/fixture', 'Land: local', 'Commit: feat(fixture): add the fixture', 'Worktree setup: none', 'Land gate: none', 'Lint: none', 'Allow: none', '',
  '## Success criterion', '`node --version`', '',
  '## Checkpoint', '- Blocks first: Task 1.', '- Parallel: none.', '- Shared state: none.', '- Smallest safe split: one file per task.', '',
  '## Manual checks', '- Open the file.', '',
  '## Tasks', '### Task 1: feat(a): add a',
  'Depends on: none | Files: `src/app.js` | Data: a line | Proof: node --version', ''
].join('\n');

async function setup(files) {
  const root = await gitRepository({ 'src/app.js': 'export const a = 1;\n', ...files });
  git(root, 'checkout', '-q', '-b', 'feat/fixture');
  await fs.mkdir(path.join(root, 'docs', 'plans'), { recursive: true });
  const planPath = path.join(root, 'docs', 'plans', 'fixture.md');
  await fs.writeFile(planPath, planText(root));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'docs: add the plan');
  const tools = await fixture();
  const claude = path.join(tools, 'claude.mjs');
  await fs.writeFile(claude, '');
  for (const name of ['docker', 'open']) await fs.writeFile(path.join(tools, name), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  return { root, planPath, claude, tools, home: await fixture() };
}

const runPlan = (context) => run(RUN_PLAN, [context.planPath, '--root', context.root, '--claude', context.claude, '--dry-run'], {
  cwd: context.root,
  env: { HOME: context.home, PATH: `${context.tools}${path.delimiter}${process.env.PATH}` }
});

test('headless run preflight refuses with the readiness stop line when a service the repo needs is down', async () => {
  const context = await setup({ 'compose.yaml': 'services: {}\n' });
  const result = await runPlan(context);
  assert.equal(result.code, 2, result.stdout + result.stderr);
  assert.match(result.stdout, /^run-plan: refused: docker not running: /, result.stdout);
});

test('headless run preflight passes when the repo needs no service', async () => {
  const context = await setup({});
  const result = await runPlan(context);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^Provider: /m);
});
