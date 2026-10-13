// verify.mjs runs each landed task's Proof command: when it runs, skips, fails,
// times out or hands an MCP tool to the session.

import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { run } from './harness.mjs';
import { gitRepository, SCRIPT, landTask, CLEAN_CHECK } from './verify-gate-fixture.mjs';

test('a relative --root names the checkout from the caller directory, not from inside it', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n',
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', path.join(root, 'plan.md'), '--root', path.basename(root), '--check-command', 'node check.js'], { cwd: path.dirname(root) });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /PASS Task 1/);
  assert.match(result.stdout, /^REVIEW Branch main\.\.HEAD: /m);
});

test('a landed task whose Proof fails prints FAIL and exits 1', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): break\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(1)"\n',
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 1);
  assert.equal(result.stdout.trim().split('\n')[0], 'FAIL Task 1 (exit 1)');
});

test('a Proof killed by a signal prints the signal on its FAIL line and its output under it', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): abort\nDepends on: none | Files: `src/app.js` | Data: none | Proof: echo line a; echo line b; kill -ABRT $$\n',
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 1);
  assert.deepEqual(result.stdout.trim().split('\n').slice(0, 4), ['FAIL Task 1 (signal SIGABRT)', '  line a', '  line b', 'PASS success-criterion']);
});

test('an unlanded task never runs its Proof', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): break\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(1)"\n',
    'check.js': CLEAN_CHECK
  });

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim().split('\n')[0], 'PASS success-criterion');
});

test('a Proof: with a backtick reads as prose and is skipped, never handed to a shell', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: npm run validate, whose output holds no `[FAIL]` line\n',
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.split('\n')[0].startsWith('SKIP Task 1'));
});

test('an mcp:<tool> Proof is never spawned and prints a SESSION line, not PASS', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): play\nDepends on: none | Files: `src/app.js` | Data: none | Proof: mcp:run_playtest mode=play; touch spawned.txt\n',
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines[0], 'SESSION Task 1 (Proof: mcp:run_playtest mode=play; touch spawned.txt; run it as an MCP tool call)');
  assert.ok(!lines.includes('PASS Task 1'));
  await assert.rejects(readFile(path.join(root, 'spawned.txt')), { code: 'ENOENT' });
});

test('an unprefixed known MCP tool Proof is never spawned and prints a SESSION line in its mcp: form', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': [
      '### Task 1: feat(app): play\nDepends on: none | Files: `src/app.js` | Data: none | Proof: run_playtest mode=play; touch spawned.txt\n',
      '### Task 2: feat(app): replay\nDepends on: none | Files: `src/app.js` | Data: none | Proof: mcp:run_playtest mode=play; touch spawned.txt\n'
    ].join('\n'),
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);
  landTask(root, 2);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines[0], 'SESSION Task 1 (Proof: mcp:run_playtest mode=play; touch spawned.txt; run it as an MCP tool call)');
  assert.equal(lines[1], "SKIP Task 2 (Proof: repeats an earlier task's Proof, which runs once)");
  assert.ok(!lines.some((line) => line.startsWith('FAIL')), result.stdout);
  await assert.rejects(readFile(path.join(root, 'spawned.txt')), { code: 'ENOENT' });
});

test('an unmarked Proof naming a missing snake_case command fails with the mcp:<tool> hint', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): play\nDepends on: none | Files: `src/app.js` | Data: none | Proof: run_playtest_exo_missing mode=play\n',
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 1);
  assert.equal(result.stdout.trim().split('\n')[0], 'FAIL Task 1 (exit 127, run_playtest_exo_missing looks like an MCP tool; write the Proof as mcp:run_playtest_exo_missing)');
});

test('a Proof and a gate past their deadlines are stopped and fail with timed out after <n>s', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): hang\nDepends on: none | Files: `src/app.js` | Data: none | Proof: sleep 5\n'
  });
  landTask(root, 1);

  const started = Date.now();
  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'sleep 6'], { cwd: root, env: { EXO_PROOF_TIMEOUT_MS: '300', EXO_GATE_TIMEOUT_MS: '400' } });
  assert.equal(result.code, 1);
  assert.deepEqual(result.stdout.trim().split('\n').slice(0, 2), ['FAIL Task 1 (timed out after 0.3s)', 'FAIL success-criterion (timed out after 0.4s)']);
  assert.ok(Date.now() - started < 4000, 'neither command ran to its end');
});

const SUITE_PROOF_PLAN = (criterion) => [
  '## Plan basis', '', 'Repository: .', 'Branch: main', '',
  ...(criterion ? ['## Success criterion', `\`${criterion}\` passes.`, ''] : []),
  '### Task 1: feat(app): greet',
  'Depends on: none | Files: `src/app.js` | Data: none | Proof: npm test',
  ''
].join('\n');

// npm test, not node --test: a nested node --test inherits this runner's NODE_TEST_CONTEXT and exits 0.
const FAILING_SUITE_PACKAGE = (scripts) => JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"', ...scripts } });

test('a test-suite Proof runs under a custom final check, which may run no tests', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': SUITE_PROOF_PLAN('node check.js'),
    'check.js': CLEAN_CHECK,
    'package.json': FAILING_SUITE_PACKAGE({})
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 1);
  assert.equal(result.stdout.trim().split('\n')[0], 'FAIL Task 1 (exit 1)');
});

test('a test-suite Proof is skipped under the default gate, which runs that suite', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': SUITE_PROOF_PLAN(null),
    'package.json': FAILING_SUITE_PACKAGE({ check: 'node check.js' }),
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  const lines = result.stdout.trim().split('\n');
  assert.ok(lines[0].startsWith('SKIP Task 1'), result.stdout);
  assert.equal(lines[1], 'PASS success-criterion');
});

test('a node --test Proof on files the default gate globs cover is skipped, one off the globs runs', async () => {
  const plan = [
    '### Task 1: feat(app): greet',
    'Depends on: none | Files: `src/app.js` | Data: none | Proof: node --test tests/a.test.mjs',
    '### Task 2: feat(app): wave',
    'Depends on: none | Files: `src/app.js` | Data: none | Proof: node --test other/b.test.mjs',
    ''
  ].join('\n');
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': plan,
    'package.json': FAILING_SUITE_PACKAGE({ test: 'node --test --test-concurrency=2 "tests/*.test.mjs"', check: 'node check.js' }),
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);
  landTask(root, 2);

  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  const lines = result.stdout.trim().split('\n');
  assert.ok(lines[0].startsWith('SKIP Task 1'), result.stdout);
  // The file does not exist, so the Proof fails when it runs; what matters is that it ran.
  assert.equal(lines[1], 'FAIL Task 2 (exit 1)');
});

test('a Proof repeated by a later task runs once', async () => {
  const plan = [
    '### Task 1: feat(app): greet',
    'Depends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(1)"',
    '### Task 2: feat(app): wave',
    'Depends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(1)"',
    ''
  ].join('\n');
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'plan.md': plan, 'check.js': CLEAN_CHECK });
  landTask(root, 1);
  landTask(root, 2);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines[0], 'FAIL Task 1 (exit 1)');
  assert.ok(lines[1].startsWith('SKIP Task 2'), result.stdout);
});

test("the Success criterion's command is the gate, and a task Proof equal to it is skipped", async () => {
  const plan = [
    '## Plan basis', '', 'Repository: .', 'Branch: main', '',
    '## Success criterion', '`node check.js` passes.', '',
    '### Task 1: feat(app): greet',
    'Depends on: none | Files: `src/app.js` | Data: none | Proof: node check.js',
    ''
  ].join('\n');
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'plan.md': plan, 'check.js': CLEAN_CHECK });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.ok(lines[0].startsWith('SKIP Task 1'));
  assert.equal(lines[1], 'PASS success-criterion');
});

test('per-task Proofs overlap, at most 3 at once, and print in task order', async () => {
  // Each Proof logs +/- around a pause, so the log's running sum is how many ran at once.
  // The log sits outside the checkout, or the stray-path check would flag it.
  const logPath = path.join(await mkdtemp(path.join(tmpdir(), 'verify-gate-')), 'log.txt');
  // The trailing index keeps each command distinct, or the repeat skip would run only the first of two equal delays.
  const proof = (delay, index) => `node -e "const fs=require('fs');fs.appendFileSync('${logPath}','+\\\\n');setTimeout(()=>{fs.appendFileSync('${logPath}','-\\\\n')},${delay})" ${index}`;
  const tasks = [500, 300, 300, 50, 50].flatMap((delay, index) => [
    `### Task ${index + 1}: feat(app): step ${index + 1}`,
    `Depends on: none | Files: \`src/app.js\` | Data: none | Proof: ${proof(delay, index)}`,
    ''
  ]);
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': ['## Plan basis', '', 'Repository: .', 'Branch: main', '', ...tasks].join('\n'),
    'check.js': CLEAN_CHECK
  });
  for (let number = 1; number <= 5; number += 1) landTask(root, number);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n').slice(0, 5), ['PASS Task 1', 'PASS Task 2', 'PASS Task 3', 'PASS Task 4', 'PASS Task 5']);
  const events = (await readFile(logPath, 'utf8')).trim().split('\n');
  let running = 0;
  let peak = 0;
  for (const event of events) {
    running += event === '+' ? 1 : -1;
    peak = Math.max(peak, running);
  }
  assert.equal(peak, 3);
});

test('the gate starts while a slow Proof runs, and the lines keep their order', async () => {
  const markersOutsideCheckout = await mkdtemp(path.join(tmpdir(), 'verify-gate-'));
  const proofStarted = path.join(markersOutsideCheckout, 'proof');
  const gateStarted = path.join(markersOutsideCheckout, 'gate');
  const markStartThenAwaitOther = [
    "const fs = require('fs');",
    'const [mine, theirs] = process.argv.slice(2);',
    "fs.writeFileSync(mine, '');",
    'let rounds = 0;',
    'const poll = setInterval(() => {',
    '  rounds += 1;',
    '  if (fs.existsSync(theirs)) { clearInterval(poll); return; }',
    `  if (rounds > 400) { console.error('never started: ' + theirs); process.exit(1); }`,
    '}, 25);',
    ''
  ].join('\n');
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': `### Task 1: feat(app): greet\nDepends on: none | Files: \`src/app.js\` | Data: none | Proof: node await-other.js ${proofStarted} ${gateStarted}\n`,
    'await-other.js': markStartThenAwaitOther,
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', `node await-other.js ${gateStarted} ${proofStarted} && node check.js`], { cwd: root });
  assert.equal(result.code, 0, `${result.stdout}${result.stderr}`);
  assert.deepEqual(result.stdout.split('\n').slice(0, 2), ['PASS Task 1', 'PASS success-criterion']);
});
