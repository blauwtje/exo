import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { REVIEWER_AGENTS } from '../skills/verify/scripts/pick-reviewer.mjs';
import { git, run } from './harness.mjs';
import { gitRepository, SCRIPT, landTask, CLEAN_CHECK, INLINE_PLAN, SCOPE_PASS } from './verify-gate-fixture.mjs';

test('a landed task, a clean check and no stray paths print PASS lines and one REVIEW line', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n',
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ['PASS Task 1', 'PASS success-criterion', SCOPE_PASS,'PASS claims-diff', `REVIEW Branch main..HEAD: ${REVIEWER_AGENTS.light}`, 'OVERLAP none', 'DONE Task 1: feat(app): greet', `REPORT ${path.join(root, '.exo', 'run-report.md')}`]);
});

const RISK_PLAN = (risk) => `### Task 1: feat(app): greet\nDepends on: none | Files: \`src/app.js\` | Data: none${risk}| Proof: node -e "process.exit(0)"\n`;

async function reviewRun(files, { commits = [], args = [] } = {}) {
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
  return { root, lines: result.stdout.split('\n') };
}

async function reviewerOf(files, options) {
  const { lines } = await reviewRun(files, options);
  return lines.find((line) => line.startsWith('REVIEW Branch '))?.replace(/^[^:]*: /, '');
}

test('REVIEW: a landed task with Risk: security boundary gets the deep reviewer, another Risk the light one', async () => {
  const commits = [['feat(app): greet', 'Plan-task: plan/1', { 'src/app.js': 'export const greet = () => "hello";\n' }]];
  assert.equal(await reviewerOf({ 'plan.md': RISK_PLAN(' | Risk: security boundary ') }, { commits }), REVIEWER_AGENTS.deep);
  assert.equal(await reviewerOf({ 'plan.md': RISK_PLAN(' | Risk: data loss ') }, { commits }), REVIEWER_AGENTS.light);
});

test('REVIEW: a Signature trailer, a manifest change or a fix commit no longer picks the deep reviewer', async () => {
  const plan = { 'plan.md': RISK_PLAN(' ') };
  const src = { 'src/app.js': 'export const greet = () => "hello";\n' };
  assert.equal(await reviewerOf(plan, { commits: [['feat(app): greet', 'Plan-task: plan/1\nSignature: a.js:f(x) -> (x, y)', src]] }), REVIEWER_AGENTS.light);
  assert.equal(await reviewerOf(plan, { commits: [['feat(app): greet', 'Plan-task: plan/1', src], ['fix: review', null, { 'src/app.js': 'export const greet = () => "yo";\n' }]] }), REVIEWER_AGENTS.light);
  assert.equal(await reviewerOf({ ...plan, 'package.json': '{}\n' }, { commits: [['feat(app): greet', 'Plan-task: plan/1', { ...src, 'package.json': '{"name":"a"}\n' }]] }), REVIEWER_AGENTS.light);
});

test('REVIEW: a task changing no script file gets none (text only)', async () => {
  assert.equal(await reviewerOf({ 'plan.md': RISK_PLAN(' ') }, { commits: [['feat(app): greet', 'Plan-task: plan/1', { 'NOTES.md': 'x\n' }]] }), 'none (text only)');
});

test('REVIEW: a task whose commits merged in through a merge commit still gets its line', async () => {
  const root = await gitRepository({ 'src/app.js': 'x\n', 'plan.md': RISK_PLAN(' '), 'check.js': CLEAN_CHECK });
  const base = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '-b', 'side');
  await writeFile(path.join(root, 'src', 'app.js'), 'y\n'.repeat(300));
  git(root, 'add', '-A');
  git(root, 'commit', '-m', 'feat(app): greet', '-m', 'Plan-task: plan/1');
  git(root, 'checkout', '-');
  git(root, 'merge', '--no-ff', 'side', '-m', 'merge side');
  const result = await run(SCRIPT, ['--plan', 'plan.md', '--base', base, '--check-command', 'node check.js'], { cwd: root });
  assert.ok(result.stdout.includes(`REVIEW Branch ${base}..HEAD: ${REVIEWER_AGENTS.light}`), result.stdout);
  assert.ok(!result.stdout.includes('REVIEWER:'), result.stdout);
});

test('REVIEW: the OVERLAP lines list a file two tasks changed, and OVERLAP none otherwise', async () => {
  const plan = ['### Task 1: feat(app): a', 'Depends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"', '',
    '### Task 2: feat(app): b', 'Depends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"', ''].join('\n');
  const shared = await reviewRun({ 'plan.md': plan }, { commits: [['feat: a', 'Plan-task: plan/1', { 'src/app.js': 'a\n' }], ['feat: b', 'Plan-task: plan/2', { 'src/app.js': 'b\n' }]] });
  assert.ok(shared.lines.includes('OVERLAP src/app.js (Tasks 1, 2)'), shared.lines.join('\n'));
  const apart = await reviewRun({ 'plan.md': plan, 'src/b.js': 'z\n' }, { commits: [['feat: a', 'Plan-task: plan/1', { 'src/app.js': 'a\n' }], ['feat: b', 'Plan-task: plan/2', { 'src/b.js': 'b\n' }]] });
  assert.ok(apart.lines.includes('OVERLAP none'), apart.lines.join('\n'));
});

test('REVIEW: a plan on the inline route with no Risk prints none (inline route), even with a manifest change', async () => {
  assert.equal(await reviewerOf({ 'plan.md': INLINE_PLAN }, { commits: [['feat(app): greet', 'Plan-task: plan/1']] }), 'none (inline route)');
  const manifest = await reviewerOf({ 'plan.md': INLINE_PLAN, 'package.json': '{}\n' }, { commits: [['feat(app): greet', 'Plan-task: plan/1', { 'package.json': '{"name":"a"}\n' }]] });
  assert.equal(manifest, 'none (inline route)');
});

test('--reviews-only prints only the review lines, runs no proof or gate and records no pass', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n',
    'check.js': CLEAN_CHECK,
    '.gitignore': '.exo/\n'
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--reviews-only', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.ok(lines.every((line) => /^(?:REVIEW|OVERLAP) /.test(line)), result.stdout);
  assert.ok(lines.some((line) => line.startsWith('REVIEW Branch ')), result.stdout);
  const full = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.ok(full.stdout.includes('PASS success-criterion'), full.stdout);
  assert.ok(!full.stdout.includes('SKIP success-criterion'), 'the flag recorded no pass, so the full run still runs the gate');
});
