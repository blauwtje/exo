// Under EXO_RUN_TASK, land-task prints at most 20 lines in all: the result line, the Proof
// tail and the path of `.exo/proof-<plan id>-task-<n>.txt`, which keeps the full output.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gitRepository, git, run, compactPlanFixture, compactTask } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/build/scripts/land-task.mjs', import.meta.url));
const PROOF = 'node tests/noisy.mjs';

async function checkout(exitCode) {
  const plan = compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: PROOF })] });
  const noisy = `for (let i = 1; i <= 60; i++) console.log('noise ' + i);\nconsole.log('# pass 1');\nprocess.exit(${exitCode});\n`;
  const root = await gitRepository({ 'src/app.js': 'export function greet() {}\n', 'docs/plans/compact.md': plan, 'package.json': '{ "type": "module" }\n', 'tests/noisy.mjs': noisy });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  await fs.appendFile(path.join(root, '.git/info/exclude'), '.exo/\n');
  await fs.writeFile(path.join(root, 'src/app.js'), 'export function greet() {\n  return "hello";\n}\n');
  await fs.mkdir(path.join(root, '.exo'), { recursive: true });
  await fs.writeFile(path.join(root, '.exo/implementer-1.md'), `Landed: src/app.js\nProof:\n- \`${PROOF}\`: pass\nUnresolved: none\n`);
  return { root, planPath: path.join(root, 'docs/plans/compact.md'), record: path.join(root, '.exo/proof-compact-task-1.txt') };
}

const linesOf = (result) => (result.stdout + result.stderr).split('\n').filter((line) => line !== '');

for (const [exitCode, name] of [[0, 'a landing'], [1, 'a refused landing']]) {
  test(`under EXO_RUN_TASK ${name} prints at most 20 lines and keeps the full output in the proof file`, async () => {
    const { root, planPath, record } = await checkout(exitCode);
    const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root, env: { EXO_RUN_TASK: 'compact/1' } });
    assert.equal(result.code, exitCode, result.stderr);
    const lines = linesOf(result);
    assert.ok(lines.length <= 20, `${lines.length} lines`);
    assert.match(lines[0], exitCode === 0 ? /^Committed: [0-9a-f]+ Task 1$/ : /^land-task: Task 1: the Proof: command/);
    assert.match(lines.at(-1), /proof-compact-task-1\.txt$/);
    assert.ok(lines.some((line) => line.includes('# pass 1')));
    if (exitCode === 0) assert.match(await fs.readFile(record, 'utf8'), /^Proof: `node tests\/noisy\.mjs` -> exit 0, # pass 1$/m);
    else assert.match(await fs.readFile(record, 'utf8'), /noise 1$/m);
  });
}

test('without EXO_RUN_TASK the landing prints its whole output', async () => {
  const { root, planPath } = await checkout(0);
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Landed: 1$/m);
});
