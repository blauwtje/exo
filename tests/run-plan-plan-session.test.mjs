// run-plan.mjs --session plan: one session builds the plan, the script lands
// each task, and a stopped session leaves its leftover in a patch.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { git, run } from './harness.mjs';
import { setup, RUNNER, PLUGIN_ROOT, runPlan, land, SPAWN_ONCE } from './run-plan-fixture.mjs';

test('--session plan: one session builds both tasks, then the script lands each under its own pin and the tail follows', async () => {
  const context = await setup({ gate: 'none' });
  const wrapper = path.join(context.tools, 'lander.mjs');
  // The stub's plan session writes both files and each report; the script's land-task then commits them.
  await fs.writeFile(wrapper, `import fs from 'node:fs';\nif (!fs.existsSync(process.env.STUB_RECORD)) { for (const n of [1, 2]) { fs.writeFileSync(n === 1 ? 'a.txt' : 'b.txt', 'x\\n'); fs.mkdirSync('.exo', { recursive: true }); fs.writeFileSync('.exo/implementer-' + n + '.md', 'Landed: x\\nProof:\\nnode --version: pass\\n  v1\\nUnresolved: none\\n'); } }\nawait import(${JSON.stringify(context.stub)});\n`);
  context.stub = wrapper;
  const result = await runPlan(context, [{ result: 'Task 1: GREEN' }, { result: 'Verify done.' }], ['--session', 'plan']);
  assert.equal(result.stop, 'run-plan: stop: done, 2/2 tasks landed, gate PASS', result.stdout);
  assert.deepEqual(result.calls.map((call) => call.pin), ['plan/1']);
  assert.match(result.calls[0].stdin, /^Build Tasks 1, 2 of .*plan\.md in this session\./);
  assert.match(result.calls[0].stdin, /Land nothing/);
  assert.equal(result.calls[0].stdin.match(/### Task \d:/g).length, 2);
  assert.equal(result.calls[0].argv[result.calls[0].argv.indexOf('--max-turns') + 1], '120', 'a plan session of 2 tasks gets 60 turns per task');
  const logs = await fs.readdir(path.join(context.root, '.exo', 'run-plan', 'plan'), { recursive: true });
  assert.ok(logs.some((name) => name.endsWith('land-task-1.log')) && logs.some((name) => name.endsWith('land-task-2.log')), logs.join());
  const logDir = path.dirname(result.stdout.match(/^Details: (.+)$/m)[1]);
  const ledger = (await fs.readFile(path.join(logDir, 'sessions.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(ledger.map(({ kind, task }) => ({ kind, task })), [{ kind: 'plan', task: 1 }]);
});

test('--session plan: a plan that lists one path in two tasks exits 2 naming it; auto then picks task sessions', async () => {
  const context = await setup();
  const text = (await fs.readFile(context.plan, 'utf8')).replace('Files: `b.txt`', 'Files: `a.txt`');
  await fs.writeFile(context.plan, text);
  git(context.root, 'commit', '-q', '-am', 'docs: share a path');
  const refused = await runPlan(context, [], ['--session', 'plan']);
  assert.equal(refused.code, 2);
  assert.match(refused.stdout, /refused: --session plan: more than one task lists a\.txt/);
  const dry = await runPlan(context, [], ['--session', 'auto', '--dry-run']);
  assert.match(dry.stdout, /^Session: task$/m);
});

test('--dry-run prints the chosen session mode: auto picks plan for a small disjoint plan', async () => {
  const dry = await runPlan(await setup(), [], ['--session', 'auto', '--dry-run']);
  assert.match(dry.stdout, /^Session: plan$/m);
  assert.match(dry.stdout, /First prompt: Build Tasks 1, 2 of /);
  const bad = await runPlan(await setup(), [], ['--session', 'both']);
  assert.equal(bad.code, 2);
});

test('--session plan: a stopped plan session leaves a clean tree and index, only its own leftover in a patch, for the per-task fallback', async () => {
  const context = await setup({ gate: 'node --test' });
  const wrapper = path.join(context.tools, 'leftover.mjs');
  const seen = path.join(context.tools, 'seen.txt');
  await fs.appendFile(path.join(context.root, '.git', 'info', 'exclude'), 'build.log\n');
  // First spawn: task 1's file, report and a scratch note, a staged failing test for task 2, a binary and an ignored file, then no result line. Later spawns note what they find.
  await fs.writeFile(wrapper, [
    "import { execFileSync } from 'node:child_process';",
    "import fs from 'node:fs';",
    'if (!fs.existsSync(process.env.STUB_RECORD)) {',
    "  fs.writeFileSync('a.txt', 'x\\n');",
    "  fs.writeFileSync('b.test.mjs', \"import './b.mjs';\\n\");",
    "  execFileSync('git', ['add', 'b.test.mjs']);",
    "  fs.writeFileSync('logo.bin', Buffer.from([0, 1, 2, 255]));",
    "  fs.writeFileSync('build.log', 'ignored\\n');",
    "  fs.mkdirSync('.exo', { recursive: true });",
    "  fs.writeFileSync('.exo/implementer-1.md', 'Landed: x\\nProof:\\nnode --version: pass\\n  v1\\nUnresolved: none\\n');",
    "  fs.writeFileSync('.exo/notes-1.md', 'kept\\n');",
    '} else {',
    "  const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' }).trim() || 'none';",
    `  fs.appendFileSync(${JSON.stringify(seen)}, [...['b.test.mjs', 'a.txt', 'logo.bin', 'notes.txt', 'build.log', '.exo/notes-1.md'].map((file) => fs.existsSync(file)), staged].join(',') + '\\n');`,
    '}',
    `await import(${JSON.stringify(context.stub)});`,
    ''
  ].join('\n'));
  context.stub = wrapper;
  await fs.writeFile(path.join(context.root, 'notes.txt'), 'mine\n');
  const result = await runPlan(context, [{}, land(1), land(2), { result: 'Verify done.' }], ['--session', 'plan']);
  assert.equal(result.stop, 'run-plan: stop: done, 2/2 tasks landed, gate PASS', result.stdout);
  assert.deepEqual(result.calls.map((call) => call.pin), ['plan/1', 'plan/1', 'plan/2', null].slice(0, result.calls.length));
  assert.equal((await fs.readFile(seen, 'utf8')).split('\n')[0], 'false,false,false,true,true,true,none');
  const logDir = path.dirname(result.stdout.match(/^Details: (.+)$/m)[1]);
  const patch = await fs.readFile(path.join(logDir, 'plan-leftover-1.patch'), 'utf8');
  for (const held of [/b\.test\.mjs/, /a\.txt/, /logo\.bin/, /GIT binary patch/]) assert.match(patch, held);
  for (const kept of [/\.exo\//, /notes\.txt/, /build\.log/]) assert.doesNotMatch(patch, kept);
  assert.match(await fs.readFile(path.join(context.root, 'notes.txt'), 'utf8'), /mine/);
});

test('--session plan: a plan session that leaves a clean tree writes no leftover patch', async () => {
  const context = await setup();
  const result = await runPlan(context, [{}, land(1), land(2), { result: 'Verify done.' }], ['--session', 'plan']);
  assert.equal(result.stop, 'run-plan: stop: done, 2/2 tasks landed, gate PASS', result.stdout);
  const logDir = path.dirname(result.stdout.match(/^Details: (.+)$/m)[1]);
  assert.deepEqual((await fs.readdir(logDir)).filter((name) => name.startsWith('plan-leftover')), []);
  assert.doesNotMatch(result.stdout, /leftover/);
});

test('--session plan: a leftover git cannot add stops the run before any fallback session and leaves the tree as it was', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, async () => {
  const context = await setup();
  const wrapper = path.join(context.tools, 'unreadable.mjs');
  await fs.writeFile(wrapper, `import fs from 'node:fs';\nif (!fs.existsSync(process.env.STUB_RECORD)) { fs.writeFileSync('a.txt', 'x\\n'); fs.writeFileSync('secret.txt', 'y\\n'); fs.chmodSync('secret.txt', 0); }\nawait import(${JSON.stringify(context.stub)});\n`);
  context.stub = wrapper;
  const result = await runPlan(context, [{}, land(1)], ['--session', 'plan']);
  assert.match(result.stop, /^run-plan: stop: plan session leftover not cleared: git add of the untracked files failed: /, result.stdout);
  assert.equal(result.calls.length, 1, 'no fallback session starts on the dirty tree');
  assert.equal(await fs.readFile(path.join(context.root, 'a.txt'), 'utf8'), 'x\n');
  assert.ok((await fs.stat(path.join(context.root, 'secret.txt'))).isFile());
  const logDir = path.dirname(result.stdout.match(/^Details: (.+)$/m)[1]);
  assert.deepEqual((await fs.readdir(logDir)).filter((name) => name.startsWith('plan-leftover')), []);
});

test('--session plan: a log dir removed during the plan session stops the run with its leftover in place, without a crash', async () => {
  const context = await setup();
  const wrapper = path.join(context.tools, 'gone.mjs');
  await fs.writeFile(wrapper, `import fs from 'node:fs';\nfs.writeFileSync('a.txt', 'x\\n');\nfs.rmSync('.exo/run-plan', { recursive: true, force: true });\nawait import(${JSON.stringify(context.stub)});\n`);
  const scenario = path.join(context.tools, 'scenario.json');
  await fs.writeFile(scenario, JSON.stringify({ pluginPath: PLUGIN_ROOT, planPath: context.plan, steps: [{}] }));
  const result = await run(RUNNER, [context.plan, '--root', context.root, '--claude', wrapper, '--session', 'plan'], {
    cwd: context.root, env: { STUB_SCENARIO: scenario, STUB_RECORD: path.join(context.tools, 'calls.jsonl'), CLAUDECODE: '1', HOME: context.home }
  });
  assert.doesNotMatch(result.stderr, /ENOENT|Error:/);
  assert.match(result.stdout, /plan session leftover not cleared: writing plan-leftover-1\.patch failed: ENOENT/);
  assert.equal(await fs.readFile(path.join(context.root, 'a.txt'), 'utf8'), 'x\n');
  assert.equal((await fs.readFile(path.join(context.tools, 'calls.jsonl'), 'utf8')).trim().split('\n').length, 1);
});

test('a log dir removed while a session writes output does not crash the runner', async () => {
  const context = await setup();
  const wrapper = path.join(context.tools, 'wrapper.mjs');
  await fs.writeFile(wrapper, `import fs from 'node:fs';\nfs.rmSync('.exo/run-plan', { recursive: true, force: true });\nawait import(${JSON.stringify(context.stub)});\n`);
  const scenario = path.join(context.tools, 'scenario.json');
  await fs.writeFile(scenario, JSON.stringify({ pluginPath: PLUGIN_ROOT, planPath: context.plan, steps: [{ result: 'Looked.' }] }));
  const result = await run(RUNNER, [context.plan, '--root', context.root, '--claude', wrapper, '--session', 'task', ...SPAWN_ONCE], {
    cwd: context.root, env: { STUB_SCENARIO: scenario, STUB_RECORD: path.join(context.tools, 'calls.jsonl'), CLAUDECODE: '1', HOME: context.home }
  });
  assert.doesNotMatch(result.stderr, /ENOENT|Error:/);
  assert.match(result.stdout, /^Landed 0 of 2 tasks\./m);
});
