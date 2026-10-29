import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { git } from './harness.mjs';
import { editApp, landingCheckout } from './land-task-fixture.mjs';
import { findingsDigest } from '../skills/gate/scripts/merge-reviews.mjs';

const VERIFY = fileURLToPath(new URL('../skills/gate/scripts/gate.mjs', import.meta.url));
const FINDINGS = 'src/app.js:1-3; defect; greet returns nothing; fix | fixed\n  Probe: grep -q hello src/app.js\n';
const env = { ...process.env, EXO_RUN: '', EXO_RUN_DIR: '' };

const GUARDED = 'Sweep: 1 fixed\nGuard: none (one-off)';

async function repairCheckout(findings = FINDINGS, landGate = null) {
  const { root, planPath } = await landingCheckout();
  git(root, 'switch', '-q', '-c', 'feat/fixture');
  if (landGate !== null) {
    const plan = await fs.readFile(planPath, 'utf8');
    await fs.writeFile(planPath, plan.replace('Branch: feat/fixture', `Branch: feat/fixture\nLand gate: ${landGate}`));
    git(root, 'commit', '-q', '-am', 'docs: land gate');
  }
  const preFixSha = git(root, 'rev-parse', 'HEAD').trim();
  await fs.mkdir(path.join(root, '.exo'), { recursive: true });
  const findingsPath = path.join(root, '.exo', 'branch-review.md');
  await fs.writeFile(findingsPath, findings);
  return { root, planPath, preFixSha, findingsPath };
}

async function commitFix(root, trailers = GUARDED, files = {}) {
  await editApp(root);
  for (const [file, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), content);
  }
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'fix(app): greet', ...(trailers === null ? [] : ['-m', trailers]));
}

const FAILING_TEST = "const file = 'src/app.js';\nprocess.exit(file ? 1 : 0);\n";

function verifyRepair({ root, planPath, preFixSha, findingsPath }, hash = findingsDigest(FINDINGS)) {
  const result = spawnSync('node', [VERIFY, '--repair', '--plan', planPath, '--root', root, '--pre-fix-sha', preFixSha, '--findings', findingsPath, '--findings-sha256', hash], { encoding: 'utf8', env });
  return { status: result.status, lines: result.stdout.trim().split('\n') };
}

test('--repair fails fixer-uncommitted when the fixer left a changed path', async () => {
  const checkout = await repairCheckout();
  await editApp(checkout.root);
  const { status, lines } = verifyRepair(checkout);
  assert.equal(status, 1);
  assert.ok(lines.some((line) => line.startsWith('FAIL fixer-uncommitted')), lines.join('\n'));
  assert.ok(lines.includes('   M src/app.js'), lines.join('\n'));
});

test('--repair fails fixer-no-commits when a finding is fixed and no commit followed the pre-fix sha', async () => {
  const { status, lines } = verifyRepair(await repairCheckout());
  assert.equal(status, 1);
  assert.ok(lines.some((line) => line.startsWith('FAIL fixer-no-commits')), lines.join('\n'));
});

test('--repair fails stale-findings when a finding line changed since review', async () => {
  const checkout = await repairCheckout();
  await fs.appendFile(checkout.findingsPath, 'src/app.js:9; concern; added after review; fix | fixed\n');
  const { status, lines } = verifyRepair(checkout);
  assert.equal(status, 1);
  assert.ok(lines.some((line) => line.startsWith('FAIL stale-findings')), lines.join('\n'));
  await fs.writeFile(checkout.findingsPath, FINDINGS.replace('returns nothing', 'returns something'));
  assert.ok(verifyRepair(checkout).lines.some((line) => line.startsWith('FAIL stale-findings')));
});

test('--repair keeps stale-findings quiet for the marks and detail lines a fixer writes', async () => {
  const reviewed = 'src/app.js:1-3; defect; greet returns nothing; fix\nsrc/app.js:5; note; naming; report\n';
  const checkout = await repairCheckout(reviewed);
  const hash = findingsDigest(reviewed);
  await fs.writeFile(checkout.findingsPath, 'src/app.js:1-3; defect; greet returns nothing; fix | fixed\n  Probe: grep -q hello src/app.js\n  Class: missing return\nsrc/app.js:5; note; naming; report | reported: out of scope\nFAIL repair-test tests/x.test.mjs\n  stderr line\n');
  const { lines } = verifyRepair(checkout, hash);
  assert.ok(!lines.some((line) => line.startsWith('FAIL stale-findings')), lines.join('\n'));
});

test('--repair passes a guarded commit, dispatches the fix-diff review and counts the pass', async () => {
  const checkout = await repairCheckout();
  await commitFix(checkout.root);
  const { status, lines } = verifyRepair(checkout);
  assert.equal(status, 0);
  assert.equal(lines[0], 'PASS fixer-committed');
  assert.ok(lines[1].startsWith('PASS repair-recheck'), lines.join('\n'));
  const dispatch = lines.filter((line) => line.startsWith('DISPATCH Repair: '));
  assert.equal(dispatch.length, 1, lines.join('\n'));
  assert.ok(dispatch[0].includes(` scope=fix-diff ${checkout.preFixSha}..HEAD findings=${path.join(checkout.root, '.exo', 'fix-review.md')}`), dispatch[0]);
  assert.equal(lines.at(-1), 'LOOP next=done round=1/2');
  const state = JSON.parse(await fs.readFile(path.join(checkout.root, '.exo', 'verify-state.json'), 'utf8'));
  assert.deepEqual(state, { repairPasses: 1 });
});

test('--repair accepts a clean tree with no commit when no finding was fixed', async () => {
  const unfixed = 'src/app.js:1-3; defect; greet returns nothing; fix | reported: unproven\n';
  const checkout = await repairCheckout(unfixed);
  const { status, lines } = verifyRepair(checkout, findingsDigest(unfixed));
  assert.deepEqual(lines, ['PASS fixer-committed', 'LOOP next=done round=1/2']);
  assert.equal(status, 0);
});

test('--repair fails fixer-no-guard naming a commit that lacks Sweep: or Guard:', async () => {
  const checkout = await repairCheckout();
  await commitFix(checkout.root, 'Sweep: 1 fixed');
  const { status, lines } = verifyRepair(checkout);
  const sha = git(checkout.root, 'rev-parse', '--short', 'HEAD').trim();
  assert.equal(status, 1);
  assert.ok(lines.includes(`FAIL fixer-no-guard (commit ${sha} lacks Guard:)`), lines.join('\n'));
  assert.ok(!lines.some((line) => line.startsWith('DISPATCH')), lines.join('\n'));
  assert.equal(lines.at(-1), 'LOOP next=fix round=1/2');
});

test('--repair fails fixer-no-guard when Guard: none gives no reason', async () => {
  const checkout = await repairCheckout();
  await commitFix(checkout.root, 'Sweep: 1 fixed\nGuard: none');
  const { lines } = verifyRepair(checkout);
  assert.ok(lines.some((line) => line.startsWith('FAIL fixer-no-guard') && line.endsWith('lacks Guard:)')), lines.join('\n'));
});

test('--repair fails fixer-guard-not-in-diff when the named guard was not touched', async () => {
  const checkout = await repairCheckout();
  await commitFix(checkout.root, 'Sweep: 1 fixed\nGuard: tests/untouched.test.mjs');
  const { status, lines } = verifyRepair(checkout);
  assert.equal(status, 1);
  assert.ok(lines.some((line) => line.startsWith('FAIL fixer-guard-not-in-diff (tests/untouched.test.mjs')), lines.join('\n'));
});

test('--repair runs a named guard test and fails repair-test when it fails', async () => {
  const checkout = await repairCheckout();
  await commitFix(checkout.root, 'Sweep: 1 fixed\nGuard: tests/guard.test.mjs', { 'tests/guard.test.mjs': 'process.exit(1);\n' });
  const { status, lines } = verifyRepair(checkout);
  assert.equal(status, 1);
  assert.ok(lines.some((line) => line.startsWith('FAIL repair-test tests/guard.test.mjs')), lines.join('\n'));
  assert.ok(!lines.some((line) => line.startsWith('DISPATCH')), lines.join('\n'));
});

test('--repair runs the tests covering the repair diff', async () => {
  const checkout = await repairCheckout();
  await commitFix(checkout.root, GUARDED, { 'tests/app.test.mjs': FAILING_TEST });
  const { status, lines } = verifyRepair(checkout);
  assert.equal(status, 1);
  assert.ok(lines.some((line) => line.startsWith('FAIL repair-test tests/app.test.mjs')), lines.join('\n'));
});

test('--repair runs the Land gate over the repair diff', async () => {
  const checkout = await repairCheckout(FINDINGS, 'exit 3');
  await commitFix(checkout.root);
  const { status, lines } = verifyRepair(checkout);
  assert.equal(status, 1);
  assert.ok(lines.some((line) => line.startsWith('FAIL repair-static exit 3 (exit 3)')), lines.join('\n'));
});

test('--repair stops at the repair bound and refuses a third pass', async () => {
  const checkout = await repairCheckout();
  await commitFix(checkout.root, GUARDED, { 'tests/app.test.mjs': FAILING_TEST });
  assert.equal(verifyRepair(checkout).lines.at(-1), 'LOOP next=fix round=1/2');
  const second = verifyRepair(checkout);
  assert.deepEqual(second.lines.slice(-2), ['STOP repair-bound', 'LOOP next=stop round=2/2']);
  const third = verifyRepair(checkout);
  assert.deepEqual(third.lines, ['STOP repair-bound', 'LOOP next=stop round=2/2']);
  assert.equal(third.status, 1);
});

test('--reviews-only starts a new round with no repair pass counted', async () => {
  const checkout = await repairCheckout();
  await commitFix(checkout.root, GUARDED, { 'tests/app.test.mjs': FAILING_TEST });
  verifyRepair(checkout);
  assert.equal(verifyRepair(checkout).lines.at(-1), 'LOOP next=stop round=2/2');
  spawnSync('node', [VERIFY, '--plan', checkout.planPath, '--root', checkout.root, '--base', 'main', '--reviews-only'], { encoding: 'utf8', env });
  assert.equal(verifyRepair(checkout).lines.at(-1), 'LOOP next=fix round=1/2');
});

test('--reviews-only prints HEAD and no FINDINGS-SHA, which merge-reviews owns', async () => {
  const { root, planPath } = await landingCheckout();
  git(root, 'switch', '-q', '-c', 'feat/fixture');
  await editApp(root);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'feat(app): greet', '-m', 'Plan-task: fixture/1');
  await fs.mkdir(path.join(root, '.exo'), { recursive: true });
  await fs.writeFile(path.join(root, '.exo', 'proof-fixture-task-1.txt'), 'pass\n');
  await fs.writeFile(path.join(root, '.exo', 'branch-review.md'), 'FINDINGS\n');
  const lines = spawnSync('node', [VERIFY, '--plan', planPath, '--root', root, '--base', 'main', '--reviews-only'], { encoding: 'utf8', env }).stdout.split('\n');
  assert.ok(!lines.some((line) => line.startsWith('FINDINGS-SHA')), lines.join('\n'));
  assert.ok(lines.includes(`HEAD ${git(root, 'rev-parse', 'HEAD').trim()}`), lines.join('\n'));
});
