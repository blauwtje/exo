// A no-red repair that changes the Proof makes run-plan run land-task again; when that recheck does
// not land the task, run.log must say so before the next session starts.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, git, gitRepository, run } from './harness.mjs';

const RUN_PLAN = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));

// The Proof passes on the base and in the checkout alike, so every land-task run ends "no red proof".
// It appends one line to the counter file each time it runs in the temporary red-green-* base tree,
// so the counter holds one line per land-task red check that reached the base.
const PROOF = [
  "import fs from 'node:fs';",
  "const base = process.cwd().includes('red-green-'); const mode = process.argv[3];",
  "if (base) fs.appendFileSync(process.argv[2], `${mode ?? 'x'}\\n`);",
  "if (mode === 'red' && base) process.exit(1);",
  "if (mode === 'fail') process.exit(1);",
  "if (mode === 'slow') { const end = Date.now() + 8000; while (Date.now() < end); }",
  ''
].join('\n');

// The fake claude records how many base runs had happened when each session started. A repair
// session edits the task's field line as FAKE_EDIT says; every other session only reports done.
const FAKE_CLAUDE = `
import fs from 'node:fs';
let prompt = '';
for await (const chunk of process.stdin) prompt += chunk;
const counter = fs.existsSync(process.env.FAKE_COUNTER) ? fs.readFileSync(process.env.FAKE_COUNTER, 'utf8').split('\\n').filter(Boolean).length : 0;
const repair = /^Plan repair of task 1 in (.+?), repository/m.exec(prompt);
fs.appendFileSync(process.env.FAKE_CALLS, JSON.stringify({ kind: repair ? 'repair' : 'build', baseRuns: counter }) + '\\n');
if (repair) {
  const plan = fs.readFileSync(repair[1], 'utf8');
  const [from, to] = JSON.parse(process.env.FAKE_EDIT);
  fs.writeFileSync(repair[1], plan.replace(from, to));
}
if (!repair) fs.appendFileSync('src/app.js', 'export const b = 2;\\n');
const proof = fs.readFileSync(process.env.FAKE_PLAN, 'utf8').match(/Proof: (.+)$/m)[1];
const report = ['Landed: src/app.js', 'Proof:', '- \`' + proof + '\`: pass', '  # pass 3', '  # fail 0', 'Unresolved: none'].join('\\n');
console.log(JSON.stringify({ type: 'result', subtype: 'success', num_turns: 1, total_cost_usd: 0, result: repair ? 'plan repaired' : report }));
`;

const planText = (root, proof, gate) => [
  '# Plan: no-red fixture', '', '## Goal', 'One file.', '',
  '## Plan basis', `Repository: ${root}`, 'Branch: feat/fixture', 'Land: local', 'Commit: feat(fixture): add the fixture', 'Worktree setup: none', `Land gate: ${gate}`, 'Lint: none', 'Allow: none', '',
  '## Success criterion', '`node --version`', '',
  '## Checkpoint', '- Blocks first: Task 1.', '- Parallel: none.', '- Shared state: none.', '- Smallest safe split: one file per task.', '',
  '## Manual checks', '- Open the file.', '',
  '## Tasks', '### Task 1: feat(a): add a',
  `Depends on: none | Files: \`src/app.js\` | Data: a line | Proof: ${proof}`, ''
].join('\n');

async function setup(gate) {
  const tools = await fixture();
  const counter = path.join(tools, 'base-runs.txt');
  const proof = `node proof.mjs ${counter}`;
  const root = await gitRepository({ 'src/app.js': 'export const a = 1;\n', 'proof.mjs': PROOF });
  git(root, 'checkout', '-q', '-b', 'feat/fixture');
  await fs.mkdir(path.join(root, 'docs', 'plans'), { recursive: true });
  const planPath = path.join(root, 'docs', 'plans', 'fixture.md');
  await fs.writeFile(planPath, planText(root, proof, gate));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'docs: add the plan');
  const claude = path.join(tools, 'claude.mjs');
  await fs.writeFile(claude, FAKE_CLAUDE);
  return { root, planPath, claude, counter, proof, calls: path.join(tools, 'calls.jsonl'), home: await fixture() };
}

async function runWithRepair(context, edit, extra = []) {
  const result = await run(RUN_PLAN, [context.planPath, '--root', context.root, '--claude', context.claude, '--session', 'task', '--max-iterations', '2', ...extra], {
    cwd: context.root,
    env: { HOME: context.home, FAKE_COUNTER: context.counter, FAKE_CALLS: context.calls, FAKE_PLAN: context.planPath, FAKE_EDIT: JSON.stringify(edit), EXO_RED_BASE_MARGIN_MS: '2000' }
  });
  const calls = (await fs.readFile(context.calls, 'utf8').catch(() => '')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return { ...result, calls };
}

const CASES = [
  { name: 'the Proof still has no red', mode: 'x', gate: 'none' },
  { name: 'the Proof fails on the head', mode: 'fail', gate: 'none' },
  { name: 'the Land gate refuses', mode: 'red', gate: 'node -e "process.exit(1)"' },
  { name: 'land-task is killed by the timeout', mode: 'slow', gate: 'none', extra: ['--timeout', '0.1'] }
];

for (const { name, mode, gate, extra } of CASES) {
  test(`a failed land recheck after a Proof repair is logged when ${name}`, async () => {
    const context = await setup(gate);
    const result = await runWithRepair(context, [context.proof, `${context.proof} ${mode}`], extra);
    const output = result.stdout + result.stderr;
    const lines = output.split('\n');
    const repaired = lines.findIndex((line) => line.includes('plan repaired, task runs again'));
    assert.notEqual(repaired, -1, output);
    const next = lines.findIndex((line, index) => index > repaired && /task 1 start/.test(line));
    assert.notEqual(next, -1, output);
    const between = lines.slice(repaired + 1, next).join('\n');
    assert.match(between, /task 1 not landed by the script|land check/, output);
  });
}
