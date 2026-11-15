import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tempDir, git, gitRepository, run } from './harness.mjs';
import { runPlanText } from './setup-fixture.mjs';

const RUN_PLAN = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));

const FAKE_CLAUDE = `
import fs from 'node:fs';
let prompt = '';
for await (const chunk of process.stdin) prompt += chunk;
fs.appendFileSync(process.env.FAKE_CALLS, 'session\\n');
console.log(JSON.stringify({ type: 'result', subtype: 'success', num_turns: 1, total_cost_usd: 0, result: 'done' }));
`;

async function setup(mode) {
  const tools = tempDir('ui-design-test-');
  const input = '/tmp/exo-absent/missing.md';
  const root = await gitRepository({ 'src/app.js': 'export const a = 1;\n' });
  git(root, 'checkout', '-q', '-b', 'feat/fixture');
  await fs.mkdir(path.join(root, 'docs', 'plans'), { recursive: true });
  const planPath = path.join(root, 'docs', 'plans', 'fixture.md');
  await fs.writeFile(planPath, runPlanText(root, { title: 'input drift fixture', sections: ['## Assumptions', '', `- assume: the notes at \`${input}\` are the only content input.`, ''] }));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'docs: add the plan');
  const claude = path.join(tools, 'claude.mjs');
  await fs.writeFile(claude, FAKE_CLAUDE);
  const calls = path.join(tools, 'calls.txt');
  const result = await run(RUN_PLAN, [planPath, '--root', root, '--claude', claude, '--session', mode, '--max-iterations', '2'], {
    cwd: root,
    env: { HOME: tempDir('ui-design-test-'), FAKE_CALLS: calls }
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
