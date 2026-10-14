// verify.mjs runs the plan's Land gate or Success criterion as the final check,
// reuses a cached pass and picks the gate a package's scripts name.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { REVIEWER_AGENTS } from '../skills/verify/scripts/pick-reviewer.mjs';
import { memoryDirectory } from '#memory-store';
import { git, run } from './harness.mjs';
import { gitRepository, SCRIPT, landTask, reviewLine, CLEAN_CHECK, SCOPE_PASS } from './verify-gate-fixture.mjs';

const FAILING_CHECK = "console.log('check failed'); process.exit(1);\n";

test('a failing check-command prints FAIL success-criterion', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n',
    'check.js': FAILING_CHECK
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 1);
  assert.deepEqual(result.stdout.trim().split('\n'), ['PASS Task 1', 'FAIL success-criterion (exit 1)', '  check failed', SCOPE_PASS,'PASS claims-diff', reviewLine(REVIEWER_AGENTS.light), 'OVERLAP none', 'DONE Task 1: feat(app): greet', `REPORT ${path.join(root, '.exo', 'run-report.md')}`]);
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
    const cacheFile = path.join(memoryDirectory(root), 'check-cache.json');
    await mkdir(path.dirname(cacheFile), { recursive: true });
    const entry = { tree: record.tree ?? tree, ms: 1 };
    await writeFile(cacheFile, JSON.stringify({ 'node check.js': entry, 'node -e "process.exit(1)"': entry }));
  }
  return root;
}

test('a check-cache entry for the same tree skips the gate and the passed Proof', async () => {
  const root = await landedWithRecord({});
  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.ok(lines[0].startsWith('SKIP Task 1'), result.stdout);
  assert.ok(lines[1].startsWith('SKIP success-criterion'), result.stdout);
});

test('a check-cache entry for another tree reruns the gate and the Proof', async () => {
  const root = await landedWithRecord({ tree: 'deadbeef' });
  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 1);
  assert.deepEqual(result.stdout.trim().split('\n').slice(0, 3), ['FAIL Task 1 (exit 1)', 'FAIL success-criterion (exit 1)', '  check failed']);
});

test('no check-cache entry reruns the gate and the Proof', async () => {
  const root = await landedWithRecord(null);
  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 1);
  assert.deepEqual(result.stdout.trim().split('\n').slice(0, 3), ['FAIL Task 1 (exit 1)', 'FAIL success-criterion (exit 1)', '  check failed']);
});

// A package whose `test` script appends one line to `runs` per run, so a test can count suite runs;
// `fields` adds other package.json fields, such as `bin`.
async function testScriptRepository(scripts, fields = {}) {
  const runs = path.join(await mkdtemp(path.join(tmpdir(), 'verify-runs-')), 'runs.log');
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: npm test\n',
    'count.js': `require('node:fs').appendFileSync(${JSON.stringify(runs)}, 'run\\n');\n`,
    'check.js': CLEAN_CHECK,
    'package.json': JSON.stringify({ ...fields, scripts })
  });
  landTask(root, 1);
  return { root, runs };
}

test('with no check script a library runs npm test once and prints a Proof line quoting its own command', async () => {
  const { root, runs } = await testScriptRepository({ test: 'node count.js' });

  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 0, result.stdout);
  const lines = result.stdout.trim().split('\n');
  assert.deepEqual(lines.slice(0, 3), [
    'SKIP Task 1 (Proof: is the gate command or a test-suite run the default gate covers, which the gate runs once below)',
    'PASS success-criterion (npm test; no check script)',
    `Proof: \`node "${SCRIPT}" --plan plan.md\` -> PASS success-criterion (npm test; no check script)`
  ]);
  assert.equal(await readFile(runs, 'utf8'), 'run\n');
});

test('with a check script the gate stays npm run check and prints no Proof line', async () => {
  const { root, runs } = await testScriptRepository({ check: 'node check.js', test: 'node count.js' });

  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 0, result.stdout);
  const lines = result.stdout.trim().split('\n');
  assert.deepEqual(lines.slice(0, 3), [
    'SKIP Task 1 (Proof: is the gate command or a test-suite run the default gate covers, which the gate runs once below)',
    'PASS success-criterion',
    SCOPE_PASS
  ]);
  assert.equal(lines.some((line) => line.startsWith('Proof:')), false);
  await assert.rejects(readFile(runs, 'utf8'), { code: 'ENOENT' });
});

test('with no check script a package with a bin or a start script passes on npm test but prints no Proof line', async () => {
  for (const [scripts, fields] of [[{ test: 'node count.js' }, { bin: 'src/app.js' }], [{ start: 'node src/app.js', test: 'node count.js' }, {}]]) {
    const { root, runs } = await testScriptRepository(scripts, fields);

    const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
    assert.equal(result.code, 0, result.stdout);
    const lines = result.stdout.trim().split('\n');
    assert.deepEqual(lines.slice(0, 3), [
      'SKIP Task 1 (Proof: is the gate command or a test-suite run the default gate covers, which the gate runs once below)',
      'PASS success-criterion (npm test; no check script)',
      SCOPE_PASS
    ]);
    assert.equal(lines.some((line) => line.startsWith('Proof:')), false);
    assert.equal(await readFile(runs, 'utf8'), 'run\n');
  }
});

test('a gate that passed on this tree is skipped on the next run, and a tracked edit reruns it', async () => {
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'plan.md': '### Task 1: feat(app): x\nDepends on: none | Files: `src/app.js` | Data: none | Proof: none\n', 'check.js': CLEAN_CHECK, '.gitignore': '.exo/\n' });
  const args = ['--plan', 'plan.md', '--check-command', 'node check.js'];
  assert.ok((await run(SCRIPT, args, { cwd: root })).stdout.startsWith('PASS success-criterion'));
  assert.ok((await run(SCRIPT, args, { cwd: root })).stdout.startsWith('SKIP success-criterion (passed on this same tree)'));
  await writeFile(path.join(root, 'check.js'), `${CLEAN_CHECK}\n`);
  assert.ok((await run(SCRIPT, args, { cwd: root })).stdout.startsWith('PASS success-criterion'));
});
