// verify.mjs runs each landed task's Proof command, the plan's own Land
// gate (or npm run check) and a stray-path check, then prints the REVIEWER
// line pick-reviewer.mjs's size facts pick. "Landed" comes from #plan-tasks'
// own landedTasks(), the same read land-task.mjs uses, so a task with no
// `Plan-task: <plan-id>/<n>` commit never runs its Proof here either.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { REVIEWER_AGENTS } from '../skills/verify/scripts/pick-reviewer.mjs';
import { criterionCommand, filesUnderGlobs, findStrayPaths, manualChecks, outputTail, runnableProof, successCriterionPasses, summaryLine, taskStates, unmarkedMcpTool } from '../skills/verify/scripts/verify.mjs';
import { git, gitRepository, run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/verify/scripts/verify.mjs', import.meta.url));

function landTask(root, number) {
  git(root, 'commit', '--allow-empty', '-m', `chore: land task ${number}`, '-m', `Plan-task: plan/${number}`);
}

test('findStrayPaths keeps only paths no task declared', () => {
  const tasks = [
    { number: 1, files: [{ path: 'src/app.js' }] },
    { number: 2, files: [{ path: 'src/broken.js' }] }
  ];
  assert.deepEqual(findStrayPaths(tasks, ['src/app.js', 'src/extra.js']), ['src/extra.js']);
  assert.deepEqual(findStrayPaths(tasks, ['src/app.js', 'src/broken.js']), []);
});

test('runnableProof reads a plain Proof as its command, and a backticked one as prose', () => {
  assert.equal(runnableProof('node -e "process.exit(0)"'), 'node -e "process.exit(0)"');
  assert.equal(runnableProof('npm run validate, whose output holds no `[FAIL]` line'), null);
  assert.equal(runnableProof(null), null);
});

test('successCriterionPasses needs exit 0 and, when a SUMMARY line is printed, a clean one', () => {
  assert.equal(successCriterionPasses({ ok: true, output: 'SUMMARY PASS=3 FAIL=0 WARN=0 UNRUN=0\n' }), true);
  assert.equal(successCriterionPasses({ ok: true, output: 'SUMMARY PASS=3 FAIL=1 WARN=0 UNRUN=0\n' }), false);
  assert.equal(successCriterionPasses({ ok: true, output: 'SUMMARY PASS=3 FAIL=0 WARN=2 UNRUN=0\n' }), false);
  assert.equal(successCriterionPasses({ ok: false, output: 'SUMMARY PASS=3 FAIL=0 WARN=0 UNRUN=0\n' }), false);
  assert.equal(successCriterionPasses({ ok: true, output: 'all green, no SUMMARY here\n' }), true);
  assert.equal(successCriterionPasses({ ok: true, output: '' }), true);
  assert.equal(successCriterionPasses({ ok: false, output: '' }), false);
});

test('summaryLine reads the last line starting SUMMARY, or null', () => {
  assert.equal(summaryLine('SUMMARY PASS=1 FAIL=1 WARN=0 UNRUN=0\nSUMMARY PASS=2 FAIL=0 WARN=0 UNRUN=0\r\n'), 'SUMMARY PASS=2 FAIL=0 WARN=0 UNRUN=0');
  assert.equal(summaryLine('  SUMMARY indented\nno SUMMARY at start\n'), null);
});

test('outputTail keeps the last 20 non-empty lines, each cut to 300 characters and indented', () => {
  const output = Array.from({ length: 25 }, (_, index) => `line ${index}`).join('\n\n');
  const tail = outputTail(`${output}\r\n${'x'.repeat(400)}\n`);
  assert.equal(tail.length, 20);
  assert.equal(tail[0], '  line 6');
  assert.equal(tail.at(-2), '  line 24');
  assert.equal(tail.at(-1), `  ${'x'.repeat(300)}`);
  assert.deepEqual(outputTail(''), []);
});

test('criterionCommand reads the first backticked command, or null', () => {
  assert.equal(criterionCommand('`npm test` passes, as does `npm run lint`.'), 'npm test');
  assert.equal(criterionCommand('the suite passes'), null);
  assert.equal(criterionCommand(null), null);
});

const CLEAN_CHECK = "console.log('SUMMARY FAIL=0 WARN=0 UNRUN=0');\n";
const FAILING_CHECK = "console.log('check failed'); process.exit(1);\n";

test('a landed task, a clean check and no stray paths print PASS lines and the light reviewer agent', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n',
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ['PASS Task 1', 'PASS success-criterion', 'PASS stray-paths', `REVIEWER: ${REVIEWER_AGENTS.light}`, 'DONE Task 1: feat(app): greet']);
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

test('unmarkedMcpTool names a snake_case first word the shell could not find, else null', () => {
  assert.equal(unmarkedMcpTool('run_playtest mode=play', { code: 127, output: 'sh: run_playtest: command not found\n' }), 'run_playtest');
  assert.equal(unmarkedMcpTool('run_playtest mode=play', { code: 127, output: 'sh: 1: run_playtest: not found\n' }), 'run_playtest');
  assert.equal(unmarkedMcpTool('run_playtest mode=play', { code: 1, output: 'sh: run_playtest: command not found\n' }), null);
  assert.equal(unmarkedMcpTool('playtest mode=play', { code: 127, output: 'sh: playtest: command not found\n' }), null);
  assert.equal(unmarkedMcpTool('run_ok && missing_tool', { code: 127, output: 'sh: missing_tool: command not found\n' }), null);
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

test('a failing check-command prints FAIL success-criterion', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n',
    'check.js': FAILING_CHECK
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 1);
  assert.deepEqual(result.stdout.trim().split('\n'), ['PASS Task 1', 'FAIL success-criterion (exit 1)', '  check failed', 'PASS stray-paths', `REVIEWER: ${REVIEWER_AGENTS.light}`, 'DONE Task 1: feat(app): greet']);
});

test('a check that exits 0 and prints no SUMMARY line passes, under any gate command', async () => {
  const plan = [
    '## Plan basis', '', 'Repository: .', 'Branch: main', '',
    '## Success criterion', '`npm run check` passes.', '',
    '### Task 1: feat(app): greet',
    'Depends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"',
    ''
  ].join('\n');
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': plan,
    'check.js': "console.log('all 12 checks green');\n",
    'package.json': JSON.stringify({ scripts: { check: 'node check.js' } })
  });
  landTask(root, 1);

  for (const args of [[], ['--check-command', 'node check.js']]) {
    const result = await run(SCRIPT, ['--plan', 'plan.md', ...args], { cwd: root });
    assert.equal(result.code, 0, result.stdout);
    assert.equal(result.stdout.trim().split('\n')[1], 'PASS success-criterion');
  }
});

test('a check that exits 0 with an unclean SUMMARY line fails, naming that line', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n',
    'check.js': "console.log('FAIL lint');\nconsole.log('SUMMARY PASS=3 FAIL=1 WARN=0 UNRUN=0');\n"
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 1);
  assert.deepEqual(result.stdout.trim().split('\n').slice(1, 4), ['FAIL success-criterion (SUMMARY PASS=3 FAIL=1 WARN=0 UNRUN=0)', '  FAIL lint', '  SUMMARY PASS=3 FAIL=1 WARN=0 UNRUN=0']);
});

test("the plan's Success criterion command runs when --check-command is not given", async () => {
  const plan = [
    '## Plan basis', '', 'Repository: .', 'Branch: main', 'Land gate: none', '',
    '## Success criterion', '`node check.js` passes.', '',
    '### Task 1: feat(app): greet',
    'Depends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"',
    ''
  ].join('\n');
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'plan.md': plan, 'check.js': CLEAN_CHECK });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes('PASS success-criterion'));
});

function mcpCriterionPlan(criterion) {
  return [
    '## Plan basis', '', 'Repository: .', 'Branch: main', '',
    '## Success criterion', `\`${criterion}\` passes.`, '',
    '### Task 1: feat(app): greet',
    'Depends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"',
    ''
  ].join('\n');
}

test('an unprefixed MCP tool Success criterion is never spawned and prints a SESSION line in its mcp: form', async () => {
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'plan.md': mcpCriterionPlan('run_playtest mode=play serverChecks=foo') });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 0, result.stdout);
  const lines = result.stdout.trim().split('\n');
  assert.ok(lines.includes('SESSION success-criterion (mcp:run_playtest mode=play serverChecks=foo; run it as an MCP tool call)'), result.stdout);
  assert.ok(!lines.some((line) => line.startsWith('FAIL')), result.stdout);
  assert.ok(!result.stdout.includes('not found'), result.stdout);
});

test('an mcp:<tool> Success criterion is never spawned and prints a SESSION line', async () => {
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'plan.md': mcpCriterionPlan('mcp:run_playtest mode=play; touch spawned.txt') });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 0, result.stdout);
  const lines = result.stdout.trim().split('\n');
  assert.ok(lines.includes('SESSION success-criterion (mcp:run_playtest mode=play; touch spawned.txt; run it as an MCP tool call)'), result.stdout);
  assert.ok(!lines.some((line) => line.startsWith('FAIL')), result.stdout);
  await assert.rejects(readFile(path.join(root, 'spawned.txt')), { code: 'ENOENT' });
});

test("a Land gate that is not 'none' is the per-task gate, so the final check falls to npm run check", async () => {
  const plan = [
    '## Plan basis', '', 'Repository: .', 'Branch: main', 'Land gate: node gate.js', '',
    '### Task 1: feat(app): greet',
    'Depends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"',
    ''
  ].join('\n');
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': plan,
    'gate.js': FAILING_CHECK,
    'check.js': CLEAN_CHECK,
    'package.json': JSON.stringify({ scripts: { check: 'node check.js' } })
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 0, result.stdout);
  assert.ok(result.stdout.includes('PASS success-criterion'));
});

test("a plan's 'Land gate: none' prints UNRUN, not PASS, and does not fail", async () => {
  const plan = [
    '## Plan basis', '', 'Repository: .', 'Branch: main', 'Land gate: none', '',
    '### Task 1: feat(app): greet',
    'Depends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"',
    ''
  ].join('\n');
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'plan.md': plan });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes('UNRUN success-criterion (Land gate: none)'));
  assert.ok(!result.stdout.includes('PASS success-criterion'));
});

test("a plan's 'Land gate: none' still runs the Success criterion command", async () => {
  const plan = [
    '## Plan basis', '', 'Repository: .', 'Branch: main', 'Land gate: none', '',
    '## Success criterion', '`node check.js` passes.', '',
    '### Task 1: feat(app): greet',
    'Depends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"',
    ''
  ].join('\n');
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'plan.md': plan, 'check.js': FAILING_CHECK });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 1);
  assert.ok(result.stdout.includes('FAIL success-criterion'));
  assert.ok(!result.stdout.includes('UNRUN success-criterion'));
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

test('filesUnderGlobs reads node --test files as covered only when every file matches a suite glob', () => {
  const globs = ['tests/*.test.mjs'];
  assert.equal(filesUnderGlobs('node --test tests/a.test.mjs', globs), true);
  assert.equal(filesUnderGlobs('node --test ./tests/a.test.mjs tests/b.test.mjs', globs), true);
  assert.equal(filesUnderGlobs('node --test tests/a.test.mjs lib/b.test.mjs', globs), false);
  assert.equal(filesUnderGlobs('node --test tests/sub/a.test.mjs', globs), false);
  assert.equal(filesUnderGlobs('node --test tests/*.test.mjs', globs), false);
  assert.equal(filesUnderGlobs('node --test --watch tests/a.test.mjs', globs), false);
  assert.equal(filesUnderGlobs('node --test', globs), false);
  assert.equal(filesUnderGlobs('node --test tests/a.test.mjs', []), false);
  assert.equal(filesUnderGlobs('node --test lib/deep/a.test.mjs', ['lib/**/*.test.mjs']), true);
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

test('a change outside every declared Files prints a STRAY line and exits 1', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n',
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);
  await import('node:fs/promises').then((fs) => fs.writeFile(path.join(root, 'src', 'extra.js'), 'export const stray = 1;\n'));

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 1);
  assert.ok(result.stdout.includes('STRAY src/extra.js'));
});

test('--root points the gate at another checkout, not the caller\'s own cwd', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n',
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);

  const result = await run(
    SCRIPT,
    ['--plan', path.join(root, 'plan.md'), '--root', root, '--check-command', 'node check.js'],
    { cwd: path.dirname(root) }
  );
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ['PASS Task 1', 'PASS success-criterion', 'PASS stray-paths', `REVIEWER: ${REVIEWER_AGENTS.light}`, 'DONE Task 1: feat(app): greet']);
});

test('missing --plan is rejected', async () => {
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n' });
  const result = await run(SCRIPT, [], { cwd: root });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--plan/);
});

test('taskStates and manualChecks read the done tasks and the Manual checks bullets', () => {
  const tasks = [{ number: 1, title: 'a' }, { number: 2, title: 'b' }];
  assert.deepEqual(taskStates(tasks, new Set([1])), [{ task: 1, title: 'a', done: true }, { task: 2, title: 'b', done: false }]);
  assert.deepEqual(manualChecks({ 'Manual checks': '- Click the badge.\n- Check the account.' }), ['Click the badge.', 'Check the account.']);
  assert.deepEqual(manualChecks({}), []);
});

test('the run ends on every task and the plan\'s manual checks', async () => {
  const plan = [
    '## Manual checks', '- Click the badge in the task list.', '',
    '## Plan basis', '', 'Repository: .', 'Branch: main', '',
    '### Task 1: feat(app): greet',
    'Depends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"',
    '',
    '### Task 2: feat(app): wave',
    'Depends on: 1 | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"',
    ''
  ].join('\n');
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'plan.md': plan, 'check.js': CLEAN_CHECK });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n').slice(-3), ['DONE Task 1: feat(app): greet', 'OPEN Task 2: feat(app): wave', 'MANUAL Click the badge in the task list.']);
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

async function landedWithRecord(record) {
  const plan = [
    '## Plan basis', '', 'Repository: .', 'Branch: main', 'Land gate: node check.js', '',
    '## Success criterion', '`node check.js` passes.', '',
    '### Task 1: feat(app): greet',
    'Depends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(1)"',
    ''
  ].join('\n');
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'plan.md': plan, 'check.js': FAILING_CHECK, '.gitignore': '.exo/\n' });
  landTask(root, 1);
  if (record !== null) {
    const tree = git(root, 'rev-parse', 'HEAD^{tree}');
    await mkdir(path.join(root, '.exo'), { recursive: true });
    await writeFile(path.join(root, '.exo/land-gate-plan.json'), JSON.stringify({ tree: record.tree ?? tree, gate: 'node check.js', proofs: ['node -e "process.exit(1)"'] }));
  }
  return root;
}

test('a land-gate record for the same tree skips the gate and the passed Proof', async () => {
  const root = await landedWithRecord({});
  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.ok(lines[0].startsWith('SKIP Task 1'), result.stdout);
  assert.ok(lines[1].startsWith('SKIP success-criterion'), result.stdout);
});

test('a land-gate record for another tree reruns the gate and the Proof', async () => {
  const root = await landedWithRecord({ tree: 'deadbeef' });
  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 1);
  assert.deepEqual(result.stdout.trim().split('\n').slice(0, 3), ['FAIL Task 1 (exit 1)', 'FAIL success-criterion (exit 1)', '  check failed']);
});

test('no land-gate record reruns the gate and the Proof', async () => {
  const root = await landedWithRecord(null);
  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 1);
  assert.deepEqual(result.stdout.trim().split('\n').slice(0, 3), ['FAIL Task 1 (exit 1)', 'FAIL success-criterion (exit 1)', '  check failed']);
});

const RISK_PLAN = (risk) => `### Task 1: feat(app): greet\nDepends on: none | Files: \`src/app.js\` | Data: none${risk}| Proof: node -e "process.exit(0)"\n`;

async function reviewerOf(files, { commits = [], args = [] } = {}) {
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'check.js': CLEAN_CHECK, ...files });
  const base = git(root, 'rev-parse', 'HEAD');
  // Each commit is [subject, trailer?, files?]; `files`, a map of path to
  // content, is written and staged first, else the commit is empty.
  for (const [subject, trailer, files = {}] of commits) {
    for (const [relativePath, content] of Object.entries(files)) await writeFile(path.join(root, relativePath), content);
    git(root, 'add', '-A');
    git(root, 'commit', '--allow-empty', '-m', subject, ...(trailer ? ['-m', trailer] : []));
  }
  const result = await run(SCRIPT, ['--plan', 'plan.md', '--base', base, '--check-command', 'node check.js', ...args], { cwd: root });
  return result.stdout.split('\n').find((line) => line.startsWith('REVIEWER: '));
}

test('a landed task with a Risk: field prints the deep reviewer for a small diff', async () => {
  const line = await reviewerOf({ 'plan.md': RISK_PLAN(' | Risk: security boundary ') }, { commits: [['feat: x', 'Plan-task: plan/1']] });
  assert.equal(line, `REVIEWER: ${REVIEWER_AGENTS.deep}`);
});

test('a Signature trailer or a branch commit without Plan-task prints the deep reviewer', async () => {
  const plan = { 'plan.md': RISK_PLAN(' ') };
  assert.equal(await reviewerOf(plan, { commits: [['feat: x', 'Plan-task: plan/1\nSignature: a.js:f(x) -> (x, y)']] }), `REVIEWER: ${REVIEWER_AGENTS.deep}`);
  assert.equal(await reviewerOf(plan, { commits: [['feat: x', 'Plan-task: plan/1'], ['fix: review', null, { 'src/app.js': 'export const greet = () => "hello";\n' }]] }), `REVIEWER: ${REVIEWER_AGENTS.deep}`);
});

test('a changed manifest prints the deep reviewer', async () => {
  const files = { 'plan.md': RISK_PLAN(' '), 'package.json': '{}\n' };
  const root = await gitRepository({ 'src/app.js': 'x\n', 'check.js': CLEAN_CHECK, ...files });
  const base = git(root, 'rev-parse', 'HEAD');
  await writeFile(path.join(root, 'package.json'), '{"name":"a"}\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-m', 'feat: x', '-m', 'Plan-task: plan/1');
  const result = await run(SCRIPT, ['--plan', 'plan.md', '--base', base, '--check-command', 'node check.js'], { cwd: root });
  assert.ok(result.stdout.includes(`REVIEWER: ${REVIEWER_AGENTS.deep}`), result.stdout);
});

test('a large diff with no risk and merge commits only prints the light reviewer', async () => {
  const root = await gitRepository({ 'src/app.js': 'x\n', 'plan.md': RISK_PLAN(' '), 'check.js': CLEAN_CHECK });
  const base = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '-b', 'side');
  await writeFile(path.join(root, 'src', 'app.js'), 'y\n'.repeat(300));
  git(root, 'add', '-A');
  git(root, 'commit', '-m', 'feat: x', '-m', 'Plan-task: plan/1');
  git(root, 'checkout', '-');
  git(root, 'merge', '--no-ff', 'side', '-m', 'merge side');
  const result = await run(SCRIPT, ['--plan', 'plan.md', '--base', base, '--check-command', 'node check.js'], { cwd: root });
  assert.ok(result.stdout.includes(`REVIEWER: ${REVIEWER_AGENTS.light}`), result.stdout);
});
