import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, git, gitRepository, run } from './harness.mjs';
import { receiptLines } from '../skills/build/scripts/run-report.mjs';

const RUN_PLAN = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));
const TASKS = 4;

const FAKE_CLAUDE = `
import fs from 'node:fs';
for await (const chunk of process.stdin);
fs.appendFileSync(process.env.FAKE_CALLS, 'x\\n');
const count = fs.readFileSync(process.env.FAKE_CALLS, 'utf8').split('\\n').filter(Boolean).length;
fs.appendFileSync('src/app.js', 'export const b' + count + ' = 2;\\n');
const proof = 'node proof.mjs ' + count;
const report = ['Landed: src/app.js', 'Proof:', '- \`' + proof + '\`: pass', '  # pass 3', '  # fail 0', 'Unresolved: none'].join('\\n');
const cost = process.env.FAKE_COST === 'none' ? {} : { total_cost_usd: Number(process.env.FAKE_COST) };
console.log(JSON.stringify({ type: 'result', subtype: 'success', num_turns: 1, ...cost, result: report }));
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
  return { root, planPath, claude, calls: path.join(tools, 'calls.txt'), home: await fixture() };
}

async function runPlan(context, { cost, extra = [] }) {
  const result = await run(RUN_PLAN, [context.planPath, '--root', context.root, '--claude', context.claude, '--session', 'task', ...extra], {
    cwd: context.root,
    env: { HOME: context.home, FAKE_CALLS: context.calls, FAKE_PLAN: context.planPath, FAKE_COST: cost }
  });
  const calls = (await fs.readFile(context.calls, 'utf8').catch(() => '')).split('\n').filter(Boolean).length;
  return { ...result, output: result.stdout + result.stderr, calls };
}

test('a run whose session costs cross --max-run-usd stops after the crossing task with exit 4 and a receipt', async () => {
  const context = await setup();
  const result = await runPlan(context, { cost: '0.45', extra: ['--max-run-usd', '1'] });
  assert.equal(result.code, 4, result.output);
  assert.equal(result.calls, 3, result.output);
  assert.match(result.output, /budget: \$0\.90 of \$1\.00 spent, the run stops after the task that reaches the ceiling/);
  assert.match(result.output, /Not landed: task 4\./);
  assert.match(result.output, /receipt task 2: \$0\.45/);
  assert.match(result.output, /receipt task sessions: \$1\.35/);
});

test('a run.json defaults.maxRunUsd sets the same ceiling', async () => {
  const context = await setup();
  await fs.mkdir(path.join(context.home, '.config', 'exo'), { recursive: true });
  await fs.writeFile(path.join(context.home, '.config', 'exo', 'run.json'), JSON.stringify({ defaults: { maxRunUsd: 0.4 } }));
  const result = await runPlan(context, { cost: '0.45' });
  assert.equal(result.code, 4, result.output);
  assert.equal(result.calls, 1, result.output);
});

test('a session that reports no cost shows as unknown in the receipt, never as zero', async () => {
  const context = await setup();
  const result = await runPlan(context, { cost: 'none', extra: ['--max-iterations', '1'] });
  assert.match(result.output, /receipt task 1: unknown \(1 session reported no cost\)/, result.output);
});

test('receiptLines groups cost by task and by agent kind and keeps unknown apart', () => {
  const lines = receiptLines([
    { kind: 'task', task: 1, cost: 0.3, known: true },
    { kind: 'repair', task: 1, cost: 0.1, known: true },
    { kind: 'review', task: null, cost: 0, known: false }
  ]);
  assert.deepEqual(lines, [
    'receipt task 1: $0.40',
    'receipt run: unknown (1 session reported no cost)',
    'receipt task sessions: $0.30',
    'receipt repair sessions: $0.10',
    'receipt review sessions: unknown (1 session reported no cost)'
  ]);
  assert.deepEqual(receiptLines([]), []);
});
