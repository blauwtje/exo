import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { landTask } from '../skills/build/scripts/land-task.mjs';
import { git, gitRepository } from './harness.mjs';
import { PLAN, editApp } from './land-task-fixture.mjs';

const BEHAVIOUR = fileURLToPath(new URL('../skills/spec/scripts/behaviour.mjs', import.meta.url));

const BRIEF = [
  '# Brief', '', '## Goal', 'Lib exports z.', '', '## Decisions', '- none', '',
  '## Acceptance', '- `lib/z.mjs` exports `z`.', '',
  '## Tasks', '', '### Task 1: do it', 'Depends on: none | Files: `lib/z.mjs`', ''
].join('\n');

async function checkout() {
  const root = await gitRepository({ 'src/app.js': 'export function greet() {}\n', 'docs/plans/fixture.md': PLAN, 'docs/specs/lib-brief.md': BRIEF });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  return { root, planPath: path.join(root, 'docs/plans/fixture.md') };
}

function withBehaviourGate(root) {
  const gate = `node ${BEHAVIOUR} --check --root ${root}`;
  return PLAN.replace('Branch: feat/fixture', `Branch: feat/fixture\nLand gate: ${gate}`);
}

test('a stale behaviour file is regenerated and lands inside the task commit', async () => {
  const { root, planPath } = await checkout();
  await fs.mkdir(path.join(root, 'docs/behaviour'));
  await fs.writeFile(path.join(root, 'docs/behaviour/lib.md'), 'old\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-m', 'seed behaviour');
  await editApp(root);
  const output = landTask({ planPath, planText: withBehaviourGate(root), number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.match(git(root, 'show', '--name-only', '--format=', 'HEAD'), /^docs\/behaviour\/lib\.md$/m);
  assert.match(await fs.readFile(path.join(root, 'docs/behaviour/lib.md'), 'utf8'), /lib\/z\.mjs/);
});

test('a land in a repository without docs/behaviour creates and stages no behaviour file', async () => {
  const { root, planPath } = await checkout();
  await editApp(root);
  const output = landTask({ planPath, planText: PLAN, number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.doesNotMatch(git(root, 'show', '--name-only', '--format=', 'HEAD'), /^docs\/behaviour\//m);
  await assert.rejects(fs.access(path.join(root, 'docs/behaviour')));
});
