import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, git, gitRepository, run } from './harness.mjs';

const RUN_PLAN = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));
const TASKS = 1;

const FAKE_CLAUDE = `
import fs from 'node:fs';
for await (const chunk of process.stdin);
const model = process.argv[process.argv.indexOf('--model') + 1];
if (model === 'sonnet') {
  console.log(JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'API Error: 529 {"type":"error","error":{"type":"overloaded_error"}}' }));
  process.exit(1);
}
fs.appendFileSync('src/app.js', 'export const b1 = 2;\\n');
const report = ['Landed: src/app.js', 'Proof:', '- \`node proof.mjs 1\`: pass', '  # pass 3', '  # fail 0', 'Unresolved: none'].join('\\n');
console.log(JSON.stringify({ type: 'result', subtype: 'success', num_turns: 1, total_cost_usd: 0.1, result: report }));
`;

const taskText = (number) => [
  `### Task ${number}: feat(a): add part ${number}`,
  `Depends on: ${number === 1 ? 'none' : number - 1} | Files: \`src/app.js\` | Data: a line | Proof: node proof.mjs ${number}`,
  ''
].join('\n');

const planText = (root) => [
  '# Plan: ceiling fixture', '', '## Goal', 'One file.', '',
  '## Plan basis', `Repository: ${root}`, 'Branch: feat/fixture', 'Land: local', 'Commit: feat(fixture): add the fixture', 'Worktree setup: none', 'Land gate: none', 'Lint: none', 'Allow: none', '',
  '## Success criterion', '`node --version`', '',
  '## Checkpoint', '- Blocks first: Task 1.', '- Parallel: none.', '- Shared state: none.', '- Smallest safe split: one file per task.', '',
  '## Manual checks', '- Open the file.', '',
  '## Tasks', ...Array.from({ length: TASKS }, (_, index) => taskText(index + 1))
].join('\n');

async function setup() {
  const tools = await fixture();
  const root = await gitRepository({ 'src/app.js': 'export const a = 1;\n', 'proof.mjs': "import fs from 'node:fs';\nprocess.exit(fs.readFileSync('src/app.js', 'utf8').includes('export const b' + process.argv[2] + ' ') ? 0 : 1);\n" });
  git(root, 'checkout', '-q', '-b', 'feat/fixture');
  await fs.mkdir(path.join(root, 'docs', 'plans'), { recursive: true });
  const planPath = path.join(root, 'docs', 'plans', 'fixture.md');
  await fs.writeFile(planPath, planText(root));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'docs: add the plan');
  const claude = path.join(tools, 'claude.mjs');
  await fs.writeFile(claude, FAKE_CLAUDE);
  return { root, planPath, claude, home: await fixture() };
}

test('the run report names the model switch when the fallback model ran the task', async () => {
  const context = await setup();
  const result = await run(RUN_PLAN, [context.planPath, '--root', context.root, '--claude', context.claude, '--session', 'task', '--model', 'sonnet', '--max-iterations', '1'], {
    cwd: context.root,
    env: { HOME: context.home, EXO_PROVIDER_RETRY_MS: '10' }
  });
  const output = result.stdout + result.stderr;
  assert.match(output, /task 1 model sonnet -> opus/, output);
  assert.match(output, /task 1 landed/, output);
});
