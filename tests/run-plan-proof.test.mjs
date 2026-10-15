import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { git, run } from './harness.mjs';
import { setup } from './run-plan-fixture.mjs';

const RUNNER = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));
const PLUGIN_ROOT = await fs.realpath(fileURLToPath(new URL('..', import.meta.url)));

const writer = (stub) => `import fs from 'node:fs';
const index = fs.existsSync(process.env.STUB_RECORD) ? fs.readFileSync(process.env.STUB_RECORD, 'utf8').split('\\n').filter(Boolean).length : 0;
if (index < 2) {
  fs.writeFileSync(index === 0 ? 'a.txt' : 'b.txt', 'x\\n');
  fs.mkdirSync('.exo', { recursive: true });
  fs.writeFileSync('.exo/implementer-' + (index + 1) + '.md', 'Landed: x\\nProof:\\nnode --version: pass\\n  v1\\nUnresolved: none\\n');
}
await import(${JSON.stringify(stub)});
`;

async function useWriter(context) {
  const wrapper = path.join(context.tools, 'writer.mjs');
  await fs.writeFile(wrapper, writer(context.stub));
  context.stub = wrapper;
}

async function runTaskMode(context, steps) {
  const scenario = path.join(context.tools, 'scenario.json');
  const record = path.join(context.tools, 'calls.jsonl');
  await fs.writeFile(scenario, JSON.stringify({ pluginPath: PLUGIN_ROOT, planPath: context.plan, steps }));
  const result = await run(RUNNER, [context.plan, '--root', context.root, '--claude', context.stub, '--session', 'task'], {
    cwd: context.root,
    env: { STUB_SCENARIO: scenario, STUB_RECORD: record, CLAUDECODE: '1', HOME: context.home, EXO_RUN_DIR: '' }
  });
  const text = await fs.readFile(record, 'utf8').catch(() => '');
  return { ...result, calls: text.split('\n').filter(Boolean).map((line) => JSON.parse(line)) };
}

const logsOf = (context) => fs.readdir(path.join(context.root, '.exo', 'run-plan', 'plan'), { recursive: true });

test('task mode: the script lands each task after a session that committed nothing', async () => {
  const context = await setup();
  await useWriter(context);
  const result = await runTaskMode(context, [{ result: 'Task 1: GREEN' }, { result: 'Task 2: GREEN' }]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(result.calls.length, 2, 'one session per task, no retry');
  const logs = await logsOf(context);
  assert.ok(logs.some((name) => name.endsWith('land-task-1.log')) && logs.some((name) => name.endsWith('land-task-2.log')), logs.join());
});

test('task mode: the prompt hands the proof to the script and warns off the sandbox trap', async () => {
  const context = await setup();
  const result = await runTaskMode(context, [{ result: 'Task 1: BLOCKED stub' }]);
  const prompt = result.calls[0].stdin;
  assert.doesNotMatch(prompt, /^Land: /m, 'no land step');
  assert.doesNotMatch(prompt, /land-task\.mjs(?! --code-rules)/, 'no land command, only the code-rules check');
  assert.match(prompt, /A test or command your sandbox or permission rules refuse is not a block: never end `Task 1: BLOCKED` on one/);
  assert.match(prompt, /Write and Edit tools, not a heredoc/);
  assert.match(prompt, /the script proves and lands/);
});

test('task mode: a session that ends BLOCKED is not landed by the script', async () => {
  const context = await setup();
  await useWriter(context);
  const result = await runTaskMode(context, [{ result: 'Task 1: BLOCKED NEEDS ANSWER: which one?' }]);
  assert.notEqual(result.code, 0, result.stdout);
  const logs = await logsOf(context);
  assert.ok(!logs.some((name) => name.includes('land-task-')), logs.join());
});

test('task mode: a session that ends BLOCKED on a permission denial is landed when the script gate passes', async () => {
  const context = await setup();
  await useWriter(context);
  const denial = { tool_name: 'Bash', tool_use_id: 'toolu_1', tool_input: { command: 'node --version' } };
  const result = await runTaskMode(context, [{ result: "Task 1: BLOCKED Bash denied in don't-ask mode", denials: [denial] }, { result: 'Task 2: GREEN' }]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(git(context.root, 'log', '--format=%B'), /Plan-task: plan\/1/);
});

test('task mode: a failing proof leaves the task unlanded and the retry note names the land log', async () => {
  const context = await setup();
  const text = (await fs.readFile(context.plan, 'utf8')).replace('Proof: node --version | Red: none (fixture)', 'Proof: node -e "process.exit(1)" | Red: none (fixture)');
  await fs.writeFile(context.plan, text);
  git(context.root, 'commit', '-q', '-am', 'docs: failing proof');
  await useWriter(context);
  const result = await runTaskMode(context, [{ result: 'Task 1: GREEN' }, { result: 'Task 1: GREEN' }]);
  assert.notEqual(result.code, 0, result.stdout);
  assert.match(result.calls[1].stdin, /The previous attempt did not land task 1\. Its last result line: /);
  assert.match(result.calls[1].stdin, /land-task-1\.log/);
});

test('task mode: a retry after a failed land resumes the failed session with only the retry note', async () => {
  const context = await setup();
  const text = (await fs.readFile(context.plan, 'utf8')).replace('Proof: node --version | Red: none (fixture)', 'Proof: node -e "process.exit(require(\'fs\').existsSync(\'b.txt\')?0:1)" | Red: none (fixture)');
  await fs.writeFile(context.plan, text);
  git(context.root, 'commit', '-q', '-am', 'docs: proof needs b.txt');
  await useWriter(context);
  const result = await runTaskMode(context, [{ result: 'Task 1: GREEN' }, { result: 'Task 1: GREEN' }, { result: 'Task 2: GREEN' }]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  const { argv, stdin } = result.calls[1];
  assert.equal(argv[argv.indexOf('--resume') + 1], 'session-1');
  assert.match(stdin, /The previous attempt did not land task 1\./);
  assert.doesNotMatch(stdin, /^Land Task 1 of /m);
  assert.ok(!result.calls[0].argv.includes('--resume'), 'the first try is fresh');
});

test('task mode: a resumed retry logs only its own cost, not the session total claude reports', async () => {
  const context = await setup();
  const text = (await fs.readFile(context.plan, 'utf8')).replace('Proof: node --version | Red: none (fixture)', 'Proof: node -e "process.exit(require(\'fs\').existsSync(\'b.txt\')?0:1)" | Red: none (fixture)');
  await fs.writeFile(context.plan, text);
  git(context.root, 'commit', '-q', '-am', 'docs: proof needs b.txt');
  await useWriter(context);
  const costs = [0.02, 0.05, 0.02];
  const wrapper = path.join(context.tools, 'cost.mjs');
  await fs.writeFile(wrapper, `import fs from 'node:fs';
const index = fs.existsSync(process.env.STUB_RECORD) ? fs.readFileSync(process.env.STUB_RECORD, 'utf8').split('\\n').filter(Boolean).length : 0;
const write = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, ...rest) => write(String(chunk).replace('"total_cost_usd":0.02', '"total_cost_usd":' + ${JSON.stringify(costs)}[index]), ...rest);
await import(${JSON.stringify(context.stub)});
`);
  context.stub = wrapper;
  const result = await runTaskMode(context, [{ result: 'Task 1: GREEN' }, { result: 'Task 1: GREEN' }, { result: 'Task 2: GREEN' }]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.ok(result.calls[1].argv.includes('--resume'), 'the second try resumes');
  const logDir = path.dirname(result.stdout.match(/^Details: (.+)$/m)[1]);
  const ledger = (await fs.readFile(path.join(logDir, 'sessions.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line).costUsd);
  assert.deepEqual(ledger.map((cost) => Number(cost.toFixed(6))), [0.02, 0.03, 0.02]);
});

// Defect E: the sandbox stopped the builder's test, it ended GREEN with the proof `not run`,
// and the script's proof failure then spent the task's one retry.
const unprovenWriter = (stub, unproven) => `import fs from 'node:fs';
const index = fs.existsSync(process.env.STUB_RECORD) ? fs.readFileSync(process.env.STUB_RECORD, 'utf8').split('\\n').filter(Boolean).length : 0;
fs.writeFileSync('a.txt', 'x' + index + '\\n');
fs.mkdirSync('.exo', { recursive: true });
const outcome = index < ${unproven} ? 'not run (sandbox: SocketException (13): Permission denied)' : 'pass';
fs.writeFileSync('.exo/implementer-1.md', 'Landed: x\\nProof:\\nnode -e "process.exit(1)": ' + outcome + '\\nUnresolved: none\\n');
await import(${JSON.stringify(stub)});
`;

async function runUnproven(unproven) {
  const context = await setup();
  const text = (await fs.readFile(context.plan, 'utf8')).replace('Proof: node --version | Red: none (fixture)', 'Proof: node -e "process.exit(1)" | Red: none (fixture)');
  await fs.writeFile(context.plan, text);
  git(context.root, 'commit', '-q', '-am', 'docs: failing proof');
  const wrapper = path.join(context.tools, 'unproven-writer.mjs');
  await fs.writeFile(wrapper, unprovenWriter(context.stub, unproven));
  context.stub = wrapper;
  return runTaskMode(context, Array.from({ length: 5 }, () => ({ result: 'Task 1: GREEN' })));
}

test('task mode: a script proof failure after a sandbox-unproven GREEN spends no retry', async () => {
  const result = await runUnproven(1);
  assert.notEqual(result.code, 0, result.stdout);
  assert.equal(result.calls.length, 3, `the unproven try is not a retry; one retry remains for the builder-proven failure\n${result.stdout}`);
  assert.match(result.calls[1].stdin, /The script's proof and land output ended: /, 'the proof failure reaches the next try');
});

test('task mode: a second sandbox-unproven failure on the same task spends a retry', async () => {
  const result = await runUnproven(5);
  assert.notEqual(result.code, 0, result.stdout);
  assert.equal(result.calls.length, 3, `only the first unproven try is free\n${result.stdout}`);
});
