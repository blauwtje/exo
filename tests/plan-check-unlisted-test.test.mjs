import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { planCheckReport } from '../skills/spec/scripts/plan-check.mjs';
import * as harness from './harness.mjs';

const { compactPlanFixture, compactTask, gitRepository } = harness;

function planWith(root, files) {
  const task = compactTask({ number: 1, title: 'fix(widget): round', files, proof: 'node --test tests/widget.test.mjs' });
  return compactPlanFixture({ tasks: [task] })
    .replace(/^(Branch: .+)$/m, '$1\nLand: local')
    .replace('Repository: /tmp/fixture', `Repository: ${root}`);
}

function planWithProof(proof) {
  const task = compactTask({ number: 1, title: 'fix(widget): round', files: ['src/widget.mjs'], proof });
  return compactPlanFixture({ tasks: [task] });
}

test('plan-check flags a proof that diffs against a bare default branch, and passes one using the merge base', () => {
  for (const ref of ['main', 'master']) {
    const flagged = planCheckReport(planWithProof(`test -z "$(git diff ${ref} --name-only)"`));
    const line = flagged.lines.find((entry) => entry.startsWith('Task 1:') && entry.includes(`bare \`${ref}\``));
    assert.ok(line?.includes('$(git merge-base'), flagged.lines.join('; '));
  }
  const dotted = planCheckReport(planWithProof('git diff --quiet main..HEAD'));
  assert.ok(dotted.lines.some((entry) => entry.includes('bare `main`')), dotted.lines.join('; '));
  const fixed = planCheckReport(planWithProof('git diff --quiet $(git merge-base main HEAD) HEAD'));
  assert.ok(!fixed.lines.some((entry) => entry.includes('bare')), fixed.lines.join('; '));
  const plain = planCheckReport(planWithProof('node --test tests/main.test.mjs'));
  assert.ok(!plain.lines.some((entry) => entry.includes('bare')), plain.lines.join('; '));
});

test('plan-check flags a source file whose task lists none of its existing tests, and passes with one listed', async () => {
  const root = await gitRepository({
    'src/widget.mjs': 'export const x = 1;\n',
    'tests/widget.test.mjs': '// pins x\n',
    'tests/widget-round.test.mjs': '// pins rounding\n'
  });
  const flagged = planCheckReport(planWith(root, ['src/widget.mjs']));
  assert.equal(flagged.ok, false);
  const line = flagged.lines.find((entry) => entry.includes('src/widget.mjs'));
  assert.ok(line?.startsWith('Task 1:') && line.includes('tests/widget.test.mjs') && line.includes('tests/widget-round.test.mjs'), flagged.lines.join('; '));
  const listed = planCheckReport(planWith(root, ['src/widget.mjs', 'tests/widget-round.test.mjs']));
  assert.ok(!listed.lines.some((entry) => entry.includes('has existing tests')), listed.lines.join('; '));
});

function chainPlan(root, { dependsOn, proof }) {
  const tasks = [
    compactTask({ number: 1, title: 'fix(widget): round', files: ['src/widget.mjs', 'tests/widget.test.mjs'], proof: 'node --test tests/widget.test.mjs' }),
    compactTask({ number: 2, title: 'fix(gauge): clamp', dependsOn, files: ['src/gauge.mjs'], proof }),
    compactTask({ number: 3, title: 'fix(dial): snap', dependsOn: '2', files: ['src/dial.mjs'], proof: 'node --test ./tests/widget.test.mjs' })
  ];
  return compactPlanFixture({ tasks }).replace('Repository: /tmp/fixture', `Repository: ${root}`);
}

const proofLines = (report) => report.lines.filter((entry) => entry.includes('its Proof runs it'));

test('plan-check flags a Proof test that exists under --root and no task in its Depends on chain lists', async () => {
  const root = await gitRepository({
    'src/widget.mjs': 'export const x = 1;\n',
    'src/gauge.mjs': 'export const y = 1;\n',
    'src/dial.mjs': 'export const z = 1;\n',
    'tests/widget.test.mjs': '// pins x\n',
    'tests/gauge-clamp.test.mjs': '// pins clamping\n'
  });
  const flagged = planCheckReport(chainPlan(root, { dependsOn: '1', proof: 'node --test tests/gauge-clamp.test.mjs' }), { root });
  assert.deepEqual(proofLines(flagged), ['Task 2: add `tests/gauge-clamp.test.mjs` to Files: (its Proof runs it)']);
  const offChain = planCheckReport(chainPlan(root, { dependsOn: 'none', proof: 'node --test tests/widget.test.mjs' }), { root });
  assert.deepEqual(proofLines(offChain), [
    'Task 2: add `tests/widget.test.mjs` to Files: (its Proof runs it)',
    'Task 3: add `tests/widget.test.mjs` to Files: (its Proof runs it)'
  ]);
  const fromRepository = planCheckReport(chainPlan(root, { dependsOn: '1', proof: 'node --test tests/gauge-clamp.test.mjs' }));
  assert.deepEqual(proofLines(fromRepository), ['Task 2: add `tests/gauge-clamp.test.mjs` to Files: (its Proof runs it)']);
});

test('plan-check passes a Proof test a task in its Depends on chain lists, one absent under the root, and any with no root', async () => {
  const root = await gitRepository({
    'src/widget.mjs': 'export const x = 1;\n',
    'src/gauge.mjs': 'export const y = 1;\n',
    'src/dial.mjs': 'export const z = 1;\n',
    'tests/widget.test.mjs': '// pins x\n',
    'tests/gauge-clamp.test.mjs': '// pins clamping\n'
  });
  const chained = planCheckReport(chainPlan(root, { dependsOn: '1', proof: 'node --test tests/widget.test.mjs' }), { root });
  assert.deepEqual(proofLines(chained), [], chained.lines.join('; '));
  const absent = planCheckReport(chainPlan(root, { dependsOn: '1', proof: 'node --test tests/gauge-new.test.mjs' }), { root });
  assert.deepEqual(proofLines(absent), [], absent.lines.join('; '));
  const noRoot = planCheckReport(chainPlan(root, { dependsOn: '1', proof: 'node --test tests/gauge-clamp.test.mjs' }).replace(`Repository: ${root}`, 'Repository: /nonexistent/fixture'));
  assert.deepEqual(proofLines(noRoot), [], noRoot.lines.join('; '));
});

const planCheckCli = path.join(import.meta.dirname, '..', 'skills', 'spec', 'scripts', 'plan-check.mjs');

test('plan-check CLI exits 1 naming a missing root, from --root or from Repository:', async () => {
  const planPath = path.join(await harness.fixture(), 'missing-root.md');
  fs.writeFileSync(planPath, chainPlan('/nonexistent/fixture', { dependsOn: '1', proof: 'node --test tests/widget.test.mjs' }));
  const fromRepository = spawnSync(process.execPath, [planCheckCli, '--plan', planPath], { encoding: 'utf8' });
  assert.equal(fromRepository.status, 1, fromRepository.stdout + fromRepository.stderr);
  assert.equal(fromRepository.stdout.trim(), 'Repository: /nonexistent/fixture does not exist');
  const fromFlag = spawnSync(process.execPath, [planCheckCli, '--plan', planPath, '--root', '/nonexistent/flag'], { encoding: 'utf8' });
  assert.equal(fromFlag.status, 1, fromFlag.stdout + fromFlag.stderr);
  assert.equal(fromFlag.stdout.trim(), 'Repository: /nonexistent/flag does not exist');
});

test('plan-check under --run skips the Proof-test check of a task that already landed', async () => {
  const root = await gitRepository({ 'src/widget.mjs': 'export const x = 1;\n', 'tests/gauge-clamp.test.mjs': '// pins clamping\n' });
  harness.git(root, 'switch', '-q', '-c', 'feat/fixture');
  harness.git(root, 'commit', '-q', '--allow-empty', '-m', 'fix(gauge): clamp', '-m', 'Plan-task: proof-landed/2');
  const planPath = path.join(await harness.fixture(), 'proof-landed.md');
  const plan = chainPlan(root, { dependsOn: '1', proof: 'node --test tests/gauge-clamp.test.mjs' });
  fs.writeFileSync(planPath, plan);
  assert.deepEqual(proofLines(planCheckReport(plan, { root, planPath })), ['Task 2: add `tests/gauge-clamp.test.mjs` to Files: (its Proof runs it)']);
  const resumed = planCheckReport(plan, { root, planPath, run: true });
  assert.deepEqual(proofLines(resumed), [], resumed.lines.join('; '));
});
