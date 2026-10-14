// verify.mjs checks the branch against the plan: unplanned paths, the run's end,
// a criterion failing only on unlanded tasks, and the claims diff.

import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { REVIEWER_AGENTS } from '../skills/verify/scripts/pick-reviewer.mjs';
import { git, run } from './harness.mjs';
import { gitRepository, SCRIPT, landTask, reviewLine, CLEAN_CHECK, INLINE_PLAN, SCOPE_PASS } from './verify-gate-fixture.mjs';

test('a change outside every declared Files prints an UNPLANNED line and exits 1', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n',
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);
  await import('node:fs/promises').then((fs) => fs.writeFile(path.join(root, 'src', 'extra.js'), 'export const stray = 1;\n'));

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 1);
  assert.ok(result.stdout.includes('UNPLANNED src/extra.js'));
});

test('a path changed only by trailer-less fix commits prints FIX-ONLY and passes; a task or non-fix commit on it stays UNPLANNED', async () => {
  const plan = '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n';
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'plan.md': plan, 'check.js': CLEAN_CHECK });
  const base = git(root, 'rev-parse', 'HEAD');
  landTask(root, 1);
  const commit = async (file, message, ...more) => {
    await writeFile(path.join(root, file), `${message}\n`, { flag: 'a' });
    git(root, 'add', '-A');
    git(root, 'commit', '-m', message, ...more);
    return git(root, 'rev-parse', '--short', 'HEAD');
  };
  const first = await commit('src/helper.js', 'fix(app): repair helper');
  const second = await commit('src/helper.js', 'fix(app): repair helper again');
  await commit('src/mixed.js', 'fix(app): repair mixed');
  await commit('src/mixed.js', 'chore: more mixed', '-m', 'Plan-task: plan/1');
  await commit('src/other.js', 'feat(app): other');

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--base', base, '--check-command', 'node check.js'], { cwd: root });
  const lines = result.stdout.trim().split('\n');
  assert.equal(result.code, 1);
  assert.ok(lines.includes('UNPLANNED src/mixed.js'), result.stdout);
  assert.ok(lines.includes('UNPLANNED src/other.js'), result.stdout);
  assert.ok(!lines.some((line) => line.startsWith('UNPLANNED src/helper.js')), result.stdout);
  assert.ok(lines.includes(`FIX-ONLY src/helper.js (${second},${first})`), result.stdout);

  const only = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'plan.md': plan, 'check.js': CLEAN_CHECK });
  const onlyBase = git(only, 'rev-parse', 'HEAD');
  landTask(only, 1);
  await writeFile(path.join(only, 'src', 'helper.js'), 'export const h = 1;\n');
  git(only, 'add', '-A');
  git(only, 'commit', '-m', 'fix(app): repair helper');
  const sha = git(only, 'rev-parse', '--short', 'HEAD');
  const clean = await run(SCRIPT, ['--plan', 'plan.md', '--base', onlyBase, '--check-command', 'node check.js'], { cwd: only });
  assert.ok(clean.stdout.includes(`FIX-ONLY src/helper.js (${sha})`), clean.stdout);
  assert.ok(clean.stdout.includes(SCOPE_PASS), clean.stdout);
  assert.ok(!clean.stdout.includes('UNPLANNED'), clean.stdout);
  assert.equal(clean.code, 0, clean.stdout + clean.stderr);
});

test('the plan file committed on the branch is the run\'s input, not an unplanned path', async () => {
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'check.js': CLEAN_CHECK });
  const base = git(root, 'rev-parse', 'HEAD');
  await mkdir(path.join(root, 'docs'));
  await writeFile(path.join(root, 'docs', 'plan.md'), '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-m', 'docs: plan');
  appendFileSync(path.join(root, 'src', 'app.js'), '// task 1\n');
  git(root, 'commit', '-am', 'feat(app): greet', '-m', 'Plan-task: plan/1');

  const fromRoot = await run(SCRIPT, ['--plan', 'docs/plan.md', '--base', base, '--check-command', 'node check.js'], { cwd: root });
  assert.ok(fromRoot.stdout.includes(`${SCOPE_PASS}\n`), fromRoot.stdout);
  const outside = path.dirname(root);
  const fromOutside = await run(SCRIPT, ['--plan', path.relative(outside, path.join(root, 'docs', 'plan.md')), '--root', root, '--base', base, '--check-command', 'node check.js'], { cwd: outside });
  assert.ok(fromOutside.stdout.includes(`${SCOPE_PASS}\n`), fromOutside.stdout);
});

test('a committed CHANGELOG.md and docs md outside every Files print DOCS lines, not UNPLANNED', async () => {
  const plan = '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n';
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'plan.md': plan, 'check.js': CLEAN_CHECK });
  const base = git(root, 'rev-parse', 'HEAD');
  landTask(root, 1);
  await mkdir(path.join(root, 'docs'));
  await writeFile(path.join(root, 'docs', 'notes.md'), 'notes\n');
  await writeFile(path.join(root, 'CHANGELOG.md'), '## Unreleased\n');
  await writeFile(path.join(root, 'src', 'extra.js'), 'export const stray = 1;\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-m', 'chore: docs and extra');

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--base', base, '--check-command', 'node check.js'], { cwd: root });
  const lines = result.stdout.trim().split('\n');
  assert.ok(lines.includes('DOCS CHANGELOG.md'), result.stdout);
  assert.ok(lines.includes('DOCS docs/notes.md'), result.stdout);
  assert.ok(lines.includes('UNPLANNED src/extra.js'), result.stdout);
  assert.ok(!lines.some((line) => line.startsWith('UNPLANNED ') && line !== 'UNPLANNED src/extra.js'), result.stdout);

  const onlyDocs = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'plan.md': plan, 'check.js': CLEAN_CHECK });
  const onlyBase = git(onlyDocs, 'rev-parse', 'HEAD');
  landTask(onlyDocs, 1);
  await writeFile(path.join(onlyDocs, 'CHANGELOG.md'), '## Unreleased\n');
  git(onlyDocs, 'add', '-A');
  git(onlyDocs, 'commit', '-m', 'chore: changelog');
  const clean = await run(SCRIPT, ['--plan', 'plan.md', '--base', onlyBase, '--check-command', 'node check.js'], { cwd: onlyDocs });
  assert.ok(clean.stdout.includes('DOCS CHANGELOG.md'), clean.stdout);
  assert.ok(clean.stdout.includes(SCOPE_PASS), clean.stdout);
  assert.equal(clean.code, 0, clean.stdout + clean.stderr);
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
  assert.deepEqual(result.stdout.trim().split('\n'), ['PASS Task 1', 'PASS success-criterion', SCOPE_PASS,'PASS claims-diff', reviewLine(REVIEWER_AGENTS.light), 'OVERLAP none', 'DONE Task 1: feat(app): greet', `REPORT ${path.join(root, '.exo', 'run-report.md')}`]);
});

test('missing --plan is rejected', async () => {
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n' });
  const result = await run(SCRIPT, [], { cwd: root });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--plan/);
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
  assert.deepEqual(result.stdout.trim().split('\n').slice(-4), ['DONE Task 1: feat(app): greet', 'OPEN Task 2: feat(app): wave', 'MANUAL Click the badge in the task list.', `REPORT ${path.join(root, '.exo', 'run-report.md')}`]);
});

// Run pe44LB's shape: the user asked for tasks 1-2 of a three-task plan, and the plan's
// criterion checks every function, so it fails on the module task 3 has not created yet.
const SCOPED_PROVE = [
  "import path from 'node:path';",
  "import { pathToFileURL } from 'node:url';",
  'let failed = 0;',
  "for (const file of ['a', 'b', 'c']) {",
  '  try {',
  "    const fn = (await import(pathToFileURL(path.resolve('src', `${file}.mjs`)).href)).default;",
  "    if (fn() !== file) throw new Error(`${file}() returned ${fn()}`);",
  "    console.log(`pass ${file}: 1 case and test/${file}.test.mjs`);",
  '  } catch (error) {',
  '    failed += 1;',
  '    console.error(`fail ${file}: ${error.message}`);',
  '  }',
  '}',
  'process.exit(failed === 0 ? 0 : 1);',
  ''
].join('\n');

const SCOPED_PLAN = [
  '## Plan basis', '', 'Repository: .', 'Branch: main', '',
  '## Success criterion', '`node prove.mjs` exits 0.', '',
  ...['a', 'b', 'c'].flatMap((file, index) => [
    `### Task ${index + 1}: feat(strings): add ${file}`,
    `Depends on: none | Files: \`src/${file}.mjs\`, \`test/${file}.test.mjs\` | Data: none | Proof: node -e "process.exit(0)"`,
    ''
  ])
].join('\n');

async function scopedRun(landedSources, landedNumbers) {
  const root = await gitRepository({ 'plan.md': SCOPED_PLAN, 'prove.mjs': SCOPED_PROVE, ...landedSources });
  // A code line, not a comment: a comment-only diff with a test file gets no model review.
  for (const number of landedNumbers) landTask(root, number, `export const task${number} = ${number};`);
  return run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
}

test('a criterion failing only on an unlanded task\'s missing module prints SKIP out of scope and still names the reviewer', async () => {
  const result = await scopedRun({ 'src/a.mjs': "export default () => 'a';\n", 'src/b.mjs': "export default () => 'b';\n" }, [1, 2]);
  assert.equal(result.code, 0, result.stdout);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines[2], 'SKIP success-criterion (out of scope: exit 1 names only files of unlanded Task 3)');
  assert.ok(!result.stdout.includes('FAIL success-criterion'));
  assert.deepEqual(lines.filter((line) => line.startsWith('REVIEW ')), [reviewLine(REVIEWER_AGENTS.light)]);
  assert.ok(lines.includes('OPEN Task 3: feat(strings): add c'));
});

test('a criterion that also fails on a landed task stays FAIL and exits 1', async () => {
  const result = await scopedRun({ 'src/a.mjs': "export default () => 'a';\n", 'src/b.mjs': "export default () => 'x';\n" }, [1, 2]);
  assert.equal(result.code, 1);
  assert.ok(result.stdout.includes('FAIL success-criterion (exit 1)'));
  assert.ok(!result.stdout.includes('SKIP success-criterion'));
});

test('a criterion failing with every task landed stays FAIL', async () => {
  const result = await scopedRun({ 'src/a.mjs': "export default () => 'a';\n", 'src/b.mjs': "export default () => 'b';\n" }, [1, 2, 3]);
  assert.equal(result.code, 1);
  assert.ok(result.stdout.includes('FAIL success-criterion (exit 1)'));
});

const claimsPlan = (title, extra) => `### Task 1: ${title}\nDepends on: none | Files: \`src/a.js\`, \`tests/a.test.mjs\`${extra} | Data: none | Proof: node -e "process.exit(0)"\n`;

// Commits `changes`, a map of path to content, as Task 1, then runs the gate.
async function claimsRun(plan, changes, seed = {}) {
  const root = await gitRepository({ 'src/a.js': 'a\n', 'tests/a.test.mjs': 'assert.ok(1);\n', 'check.js': CLEAN_CHECK, 'plan.md': plan, ...seed });
  for (const [file, content] of Object.entries(changes)) await writeFile(path.join(root, file), content);
  git(root, 'add', '-A');
  git(root, 'commit', '--allow-empty', '-m', plan.match(/^### Task 1: (.+)$/m)[1], '-m', 'Plan-task: plan/1');
  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  return { result, lines: result.stdout.trim().split('\n') };
}

test('claims-diff passes when every Files path changed in the task commit', async () => {
  const { result, lines } = await claimsRun(claimsPlan('feat(app): x', ''), { 'src/a.js': 'b\n', 'tests/a.test.mjs': 'assert.ok(1);\nassert.ok(2);\n' });
  assert.equal(result.code, 0, result.stdout);
  assert.ok(lines.includes('PASS claims-diff'), result.stdout);
});

test('claims-diff warns, without failing, on a Files path the task commit left unchanged', async () => {
  const { result, lines } = await claimsRun(claimsPlan('feat(app): x', ''), { 'src/a.js': 'b\n' });
  assert.equal(result.code, 0, result.stdout);
  assert.ok(lines.includes('WARN claims-diff Task 1 (Files: unchanged in its commit: tests/a.test.mjs)'), result.stdout);
});

test('claims-diff accepts a deleted path and a glob in Files', async () => {
  const plan = '### Task 1: refactor(app): x\nDepends on: none | Files: `src/old.js`, `src/*.mjs` | Data: none | Proof: node -e "process.exit(0)"\n';
  const root = await gitRepository({ 'src/old.js': 'old\n', 'check.js': CLEAN_CHECK, 'plan.md': plan });
  await writeFile(path.join(root, 'src/new.mjs'), 'new\n');
  git(root, 'rm', '-q', 'src/old.js');
  git(root, 'add', '-A');
  git(root, 'commit', '-m', 'refactor(app): x', '-m', 'Plan-task: plan/1');
  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 0, result.stdout);
  assert.ok(result.stdout.includes('PASS claims-diff'), result.stdout);
});

test('claims-diff fails a test-first task whose commit changes no test file, and passes one that does', async () => {
  const plan = '### Task 1: feat(app): x\nDepends on: none | Files: `src/a.js` | Data: none | Risk: security boundary | Proof: node -e "process.exit(0)"\n';
  const failing = await claimsRun(plan, { 'src/a.js': 'b\n' });
  assert.equal(failing.result.code, 1);
  assert.ok(failing.lines.includes('FAIL claims-diff Task 1 (test-first, but its commit adds or changes no test file)'), failing.result.stdout);
  const passing = await claimsRun(plan, { 'src/a.js': 'b\n', 'tests/a.test.mjs': 'assert.ok(1);\nassert.ok(2);\n' });
  assert.equal(passing.result.code, 0, passing.result.stdout);
  assert.ok(passing.lines.includes('PASS claims-diff'), passing.result.stdout);
});

test('claims-diff warns, without failing, on a removed assertion and an added skip', async () => {
  const { result, lines } = await claimsRun(claimsPlan('feat(app): x', ''), { 'src/a.js': 'b\n', 'tests/a.test.mjs': "it.skip('x', () => {});\n" });
  assert.equal(result.code, 0, result.stdout);
  assert.ok(lines.includes('WARN claims-diff Task 1 (tests/a.test.mjs:1 removed `assert.ok(1);`)'), result.stdout);
  assert.ok(lines.includes("WARN claims-diff Task 1 (tests/a.test.mjs:1 added `it.skip('x', () => {});`)"), result.stdout);
  assert.ok(!lines.includes('PASS claims-diff'));
});

test('claims-diff warns, without failing, on an added suppression comment', async () => {
  const { result, lines } = await claimsRun(claimsPlan('feat(app): x', ''), { 'src/a.js': '// eslint-disable-next-line\nb\n', 'tests/a.test.mjs': 'assert.ok(1);\n// x\n' });
  assert.equal(result.code, 0, result.stdout);
  assert.ok(lines.includes('WARN claims-diff Task 1 (src/a.js:1 silenced `// eslint-disable-next-line`)'), result.stdout);
  assert.ok(!lines.includes('PASS claims-diff'));
});

test('claims-diff holds on the inline route, whose long-format task lists a Modify path', async () => {
  const { result, lines } = await claimsRun(INLINE_PLAN, { 'src/app.js': 'export const greet = () => "hello";\n' }, { 'src/app.js': 'export const greet = () => "hi";\n' });
  assert.equal(result.code, 0, result.stdout);
  assert.ok(lines.includes('PASS claims-diff'), result.stdout);
  assert.ok(lines.includes(reviewLine('none (inline route)')), result.stdout);
});
