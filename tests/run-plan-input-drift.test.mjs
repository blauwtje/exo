import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, git, gitRepository, run } from './harness.mjs';

const RUN_PLAN = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));

const FAKE_CLAUDE = `
import fs from 'node:fs';
let prompt = '';
for await (const chunk of process.stdin) prompt += chunk;
fs.appendFileSync(process.env.FAKE_CALLS, 'session\\n');
console.log(JSON.stringify({ type: 'result', subtype: 'success', num_turns: 1, total_cost_usd: 0, result: 'done' }));
`;

const planText = (root, input) => [
  '# Plan: input drift fixture', '', '## Goal', 'One file.', '',
  '## Plan basis', `Repository: ${root}`, 'Branch: feat/fixture', 'Land: local', 'Commit: feat(fixture): add the fixture', 'Worktree setup: none', 'Land gate: none', 'Lint: none', 'Allow: none', '',
  '## Success criterion', '`node --version`', '',
  '## Checkpoint', '- Blocks first: Task 1.', '- Parallel: none.', '- Shared state: none.', '- Smallest safe split: one file per task.', '',
  '## Manual checks', '- Open the file.', '',
  '## Assumptions', '', `- assume: the notes at \`${input}\` are the only content input.`, '',
  '## Tasks', '### Task 1: feat(a): add a',
  'Depends on: none | Files: `src/app.js` | Data: a line | Proof: node --version', ''
].join('\n');

async function setup(mode) {
  const tools = await fixture();
  const input = '/tmp/exo-absent/missing.md';
  const root = await gitRepository({ 'src/app.js': 'export const a = 1;\n' });
  git(root, 'checkout', '-q', '-b', 'feat/fixture');
  await fs.mkdir(path.join(root, 'docs', 'plans'), { recursive: true });
  const planPath = path.join(root, 'docs', 'plans', 'fixture.md');
  await fs.writeFile(planPath, planText(root, input));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'docs: add the plan');
  const claude = path.join(tools, 'claude.mjs');
  await fs.writeFile(claude, FAKE_CLAUDE);
  const calls = path.join(tools, 'calls.txt');
  const result = await run(RUN_PLAN, [planPath, '--root', root, '--claude', claude, '--session', mode, '--max-iterations', '2'], {
    cwd: root,
    env: { HOME: await fixture(), FAKE_CALLS: calls }
  });
  const sessions = (await fs.readFile(calls, 'utf8').catch(() => '')).split('\n').filter(Boolean).length;
  return { input, output: result.stdout + result.stderr, sessions };
}

for (const mode of ['task', 'plan']) {
  test(`an unreachable input stops a ${mode} session run before any session`, async () => {
    const { input, output, sessions } = await setup(mode);
    assert.equal(sessions, 0, output);
    assert.match(output, /task 1 blocked/, output);
    assert.ok(output.includes(input), output);
    assert.match(output, /make that input readable on this machine or drop it from the plan/, output);
  });
}
