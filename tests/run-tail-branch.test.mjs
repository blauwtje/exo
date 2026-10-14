import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { BRANCH_REVIEW_KEY, cachedPass } from '../lib/check-cache.mjs';
import { git } from './harness.mjs';
import { runPlan, setup } from './run-plan-fixture.mjs';

const CLEAN_LINE = 'verdict=CLEAN defect=0 concern=0 question=0 fix=0 report=x';

async function useTasks(context, count) {
  const text = await fs.readFile(context.plan, 'utf8');
  const tasks = Array.from({ length: count }, (_, index) => index + 1).flatMap((number) => [
    `### Task ${number}: feat(t${number}): add t${number}`,
    `Depends on: ${number === 1 ? 'none' : number - 1} | Files: \`t${number}.txt\`, \`t${number}.test.mjs\` | Data: a line | Risk: security boundary | Proof: node --version | Red: none (fixture)`
  ]);
  await fs.writeFile(context.plan, `${text.split('### Task 1')[0]}${tasks.join('\n')}\n`);
  git(context.root, 'commit', '-q', '-am', 'docs: use review tasks');
}

const landTask = (number) => ({ commits: [{ file: `t${number}.txt`, also: [`t${number}.test.mjs`], subject: `feat(t${number}): add t${number}`, trailers: [`Plan-task: plan/${number}`] }] });

async function runBranch(count, reviewStep) {
  const context = await setup({ risk: 'security boundary' });
  await useTasks(context, count);
  const steps = [...Array.from({ length: count }, (_, index) => landTask(index + 1)), reviewStep];
  return { ...(await runPlan(context, steps)), setupRoot: context.root };
}

test('four landed tasks get one review session over the whole plan', async () => {
  const context = await runBranch(4, { result: CLEAN_LINE, findings: 'CLEAN\n' });
  assert.equal(context.stop, 'run-plan: stop: done, 4/4 tasks landed, gate PASS', context.stdout + context.stderr);
  assert.equal(context.calls.length, 5);
  const review = context.calls[4].stdin;
  assert.match(review, /^## Review/m);
  assert.match(review, /^- Scope: branch \S+\.\.HEAD$/m);
  assert.match(review, /^- Findings path: .*review-branch\.md$/m);
  assert.match(review, /correctness|requirement/i);
  assert.equal(context.calls.filter((call) => /^## Review/m.test(call.stdin)).length, 1);
});

test('a branch review that stops the run stops it with that stop', async () => {
  const context = await runBranch(2, { pluginError: 'review stub stops' });
  assert.match(context.stop, /exo not loaded/);
  assert.equal(context.calls.length, 3);
});

test('a CLEAN branch review is cached for the tree it reviewed', async () => {
  const context = await runBranch(2, { result: CLEAN_LINE, findings: 'CLEAN\n' });
  assert.notEqual(cachedPass(context.setupRoot, BRANCH_REVIEW_KEY), null, context.stdout + context.stderr);
});

test('a gate failure already on the branch is not blamed on the review fix', async () => {
  const context = await setup({ risk: 'security boundary' });
  await useTasks(context, 2);
  const findings = 'FINDINGS\n\nt1.txt:1-1; defect; swallowed failure; catch drops error; fix\n  Probe: node --version\n';
  await fs.writeFile(`${context.root}/stray.txt`, 'stray\n');
  git(context.root, 'add', 'stray.txt');
  git(context.root, 'commit', '-q', '-m', 'feat: stray file');
  const steps = [
    landTask(1), landTask(2),
    { result: 'verdict=FINDINGS defect=1 concern=0 question=0 fix=1 report=x', findings },
    { result: 'fixed=1 reported=0 report=x', edits: ['t1.txt'] }
  ];
  const run = await runPlan(context, steps);
  assert.match(run.stop, /^run-plan: stop: gate already failed before the review fix: UNPLANNED stray\.txt$/, run.stdout + run.stderr);
  assert.doesNotMatch(run.stdout, /fix broke the gate/);
  assert.match(run.stdout, /The branch fails the gate without the review fix/);
  assert.match(run.stdout, /review-fix-leftover\.patch/);
  assert.equal(git(context.root, 'status', '--porcelain'), '');
});

test('a review fix that breaks the gate and cannot be shelved is not rechecked on the dirty tree', async () => {
  const context = await setup({ risk: 'security boundary', success: '`node t1.txt`' });
  await useTasks(context, 2);
  const findings = 'FINDINGS\n\nt1.txt:1-1; defect; swallowed failure; catch drops error; fix\n  Probe: node --version\n';
  const steps = [
    landTask(1), landTask(2),
    { result: 'verdict=FINDINGS defect=1 concern=0 question=0 fix=1 report=x', findings },
    { result: 'fixed=1 reported=0 report=x', edits: ['t1.txt'], lockRoot: true }
  ];
  const run = await runPlan(context, steps);
  await fs.chmod(context.root, 0o755);
  assert.match(run.stop, /^run-plan: stop: fix broke the gate: /, run.stdout + run.stderr);
  assert.doesNotMatch(run.stdout, /already failed before the review fix/);
  assert.match(run.stdout, /not cleared|shelving the edits failed/);
});

test('a FINDINGS branch review whose fix lands is cached for the tree after the fix', async () => {
  const context = await setup({ risk: 'security boundary' });
  await useTasks(context, 2);
  const findings = 'FINDINGS\n\nt1.txt:1-1; defect; swallowed failure; catch drops error; fix\n  Probe: node --version\n';
  const steps = [
    landTask(1), landTask(2),
    { result: 'verdict=FINDINGS defect=1 concern=0 question=0 fix=1 report=x', findings },
    { result: 'fixed=1 reported=0 report=x', edits: ['t1.txt'] },
    { result: CLEAN_LINE, findings: 'CLEAN\n' }
  ];
  const run = await runPlan(context, steps);
  assert.match(run.stdout, /fix landed/, run.stdout + run.stderr);
  assert.notEqual(cachedPass(context.root, BRANCH_REVIEW_KEY), null, run.stdout + run.stderr);
});
