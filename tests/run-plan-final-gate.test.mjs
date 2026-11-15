import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tempDir, git, gitRepository, run } from './harness.mjs';
import { runPlanText } from './setup-fixture.mjs';
import { createRun, readState, runDir } from '../skills/build/scripts/run-state.mjs';

const RUN_PLAN = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));

async function landedRun(proof) {
  const root = await gitRepository({ 'src/app.js': 'export const a = 1;\n' });
  git(root, 'checkout', '-q', '-b', 'feat/fixture');
  await fs.mkdir(path.join(root, 'docs', 'plans'), { recursive: true });
  const planPath = path.join(root, 'docs', 'plans', 'fixture.md');
  await fs.writeFile(planPath, runPlanText(root, { title: 'final gate fixture', criterion: ['Red: none (fixture)'], tasks: ['### Task 1: feat(a): add a', `Depends on: none | Files: \`src/app.js\` | Data: a line | Proof: ${proof}`, ''] }));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'docs: add the plan');
  await fs.writeFile(path.join(root, 'src', 'app.js'), 'export const a = 2;\n');
  git(root, 'commit', '-q', '-am', 'feat(a): add a', '-m', 'Plan-task: fixture/1');
  const claude = path.join(tempDir('ui-design-test-'), 'claude.mjs');
  await fs.writeFile(claude, 'process.exit(1);\n');
  const id = '20260101T000000-aaaa';
  createRun(root, { id, plan: planPath });
  const result = await run(RUN_PLAN, [planPath, '--root', root, '--claude', claude, '--session', 'task'], {
    cwd: root,
    env: { HOME: tempDir('ui-design-test-'), EXO_RUN: id, EXO_RUN_DIR: runDir(root, id), EXO_RUN_TASK: '1' }
  });
  return { code: result.code, output: result.stdout + result.stderr, stop: readState(root, id).stop };
}

test('a passing gate verify ends the landed run with exit 0 and gate PASS in state.json', async () => {
  const { code, output, stop } = await landedRun('node --version');
  assert.equal(code, 0, output);
  assert.deepEqual({ kind: stop?.kind, reason: stop?.reason }, { kind: 'done', reason: 'done, 1/1 tasks landed, gate PASS' }, output);
});

test('a failing gate verify ends the landed run with exit 1 and gate FAIL in state.json', async () => {
  const { code, output, stop } = await landedRun('node -e "process.exit(1)"');
  assert.equal(code, 1, output);
  assert.deepEqual({ kind: stop?.kind, reason: stop?.reason }, { kind: 'gate', reason: 'done, 1/1 tasks landed, gate FAIL' }, output);
});
