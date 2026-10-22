// land-task.mjs runs a task's Commit: block as the plan wrote it, its trailer
// naming the plan, checks the Plan-task: <plan-id>/<n> trailer on the new
// commit and prints the landed set; a compact task
// lands only on a build report whose Proof: command passed.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { landTask } from '../skills/build/scripts/land-task.mjs';
import { workingTreeKey } from '#check-cache';
import { git, run } from './harness.mjs';
import {
  SCRIPT, cacheFile, PLAN, landingCheckout, editApp, COMPACT_PLAN, PASS_REPORT, compactCheckout, writeReport
} from './land-task-fixture.mjs';

// planFixture carries no Land gate line; this inserts one into the same
// Plan basis frame so the gate tests exercise the real grammar, not a
// hand-rolled plan shape.
function withLandGate(command) {
  return PLAN.replace('Branch: feat/fixture', `Branch: feat/fixture\nLand gate: ${command}`);
}

test('a passing Land gate lets a green task land', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const output = landTask({ planPath, planText: withLandGate('true'), number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.match(git(root, 'log', '-1', '--format=%B'), /^Plan-task: fixture\/1$/m);
});

test('a passing Land gate and Proof are recorded with their time, and no land-gate file is written', async () => {
  const { root, planPath } = await compactCheckout(COMPACT_PLAN.replace('## Plan basis\n', '## Plan basis\nLand gate: true\n'));
  const plan = await fs.readFile(planPath, 'utf8');
  landTask({ planPath, planText: plan, number: 1, root, reportText: PASS_REPORT });
  const cache = JSON.parse(await fs.readFile(cacheFile(root), 'utf8'));
  assert.deepEqual(Object.keys(cache).sort(), ['node tests/app.test.mjs', 'true']);
  assert.equal(typeof cache.true.ms, 'number');
  assert.equal(cache.true.tree, workingTreeKey(root));
  assert.equal(cache['node tests/app.test.mjs'].tree, cache.true.tree);
  await assert.rejects(fs.access(path.join(root, '.exo/land-gate-compact.json')));
});

test('a Land gate that edits a tracked file is not recorded as a pass', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const gate = "echo '// edited' >> src/app.js";
  landTask({ planPath, planText: withLandGate(gate), number: 1, root });
  const cache = JSON.parse(await fs.readFile(cacheFile(root), 'utf8').catch(() => '{}'));
  assert.ok(!(gate in cache));
});

test('a Land gate whose last pass was slow is skipped with one line and the landing commits', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  await fs.mkdir(path.dirname(cacheFile(root)), { recursive: true });
  await fs.writeFile(cacheFile(root), JSON.stringify({ 'echo ran >> gate.log && exit 1': { tree: 'old', ms: 60000 } }));
  const output = landTask({ planPath, planText: withLandGate('echo ran >> gate.log && exit 1'), number: 1, root });
  assert.match(output, /^Land gate "echo ran >> gate\.log && exit 1" skipped: its last pass took 60000 ms, so verify runs it once\.$/m);
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  await assert.rejects(fs.access(path.join(root, 'gate.log')));
});

test('a Land gate that already passed on this tree is skipped with one line', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const { recordPass } = await import('#check-cache');
  recordPass(root, 'exit 1', 5);
  const output = landTask({ planPath, planText: withLandGate('exit 1'), number: 1, root });
  assert.match(output, /^Land gate "exit 1" skipped: it already passed on this tree\.$/m);
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
});

test('a fast record still runs the Land gate and refuses a failing one', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  await fs.mkdir(path.dirname(cacheFile(root)), { recursive: true });
  await fs.writeFile(cacheFile(root), JSON.stringify({ 'exit 1': { tree: 'old', ms: 100 } }));
  assert.throws(() => landTask({ planPath, planText: withLandGate('exit 1'), number: 1, root }), /Land gate "exit 1" failed/);
});

test('a failing Land gate is refused before anything commits, naming the command and its output', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  assert.throws(
    () => landTask({ planPath, planText: withLandGate('echo gate broke && exit 1'), number: 1, root }),
    /Land gate "echo gate broke && exit 1" failed:\ngate broke/
  );
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
  const cache = JSON.parse(await fs.readFile(cacheFile(root), 'utf8').catch(() => '{}'));
  assert.ok(!('echo gate broke && exit 1' in cache));
});

test('a Land gate past its deadline is stopped and refused with timed out after <n>s, and nothing commits', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  process.env.EXO_LAND_GATE_TIMEOUT_MS = '300';
  try {
    assert.throws(
      () => landTask({ planPath, planText: withLandGate('sleep 5'), number: 1, root }),
      /Land gate "sleep 5" failed:\ntimed out after 0\.3s/
    );
  } finally {
    delete process.env.EXO_LAND_GATE_TIMEOUT_MS;
  }
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
});

// A grandchild the gate started must die with it, else it outlives the refusal.
const survivorCommand = (marker) => `(sleep 1.5; touch ${marker}) & sleep 10`;

test('a timed-out Land gate stops the processes it started too', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const marker = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'exo-tree-')), 'survivor');
  process.env.EXO_LAND_GATE_TIMEOUT_MS = '300';
  try {
    assert.throws(() => landTask({ planPath, planText: withLandGate(survivorCommand(marker)), number: 1, root }), /timed out after 0\.3s/);
  } finally {
    delete process.env.EXO_LAND_GATE_TIMEOUT_MS;
  }
  await new Promise((resolve) => setTimeout(resolve, 2500));
  await assert.rejects(fs.access(marker));
});

test('a timed-out Proof is refused with timed out after <n>s, its process tree stopped, and nothing commits', async () => {
  const marker = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'exo-tree-')), 'survivor');
  const command = survivorCommand(marker);
  const { root, planPath } = await compactCheckout(COMPACT_PLAN.replace('node tests/app.test.mjs', command));
  await writeReport(root, `Landed: src/app.js\nProof:\n- \`${command}\`: pass\nUnresolved: none\n`);
  const head = git(root, 'rev-parse', 'HEAD');
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root, env: { EXO_PROOF_TIMEOUT_MS: '300' } });
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /failed \(timed out after 0\.3s\)/);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
  await new Promise((resolve) => setTimeout(resolve, 2500));
  await assert.rejects(fs.access(marker));
});

// bash exits 0 at once, but a background child holds the output pipe past the deadline.
test('a Proof whose bash exits 0 while a background child outlives the deadline is refused, not cached as a pass', async () => {
  const command = '(sleep 5) & true';
  const { root, planPath } = await compactCheckout(COMPACT_PLAN.replace('node tests/app.test.mjs', command));
  await writeReport(root, `Landed: src/app.js\nProof:\n- \`${command}\`: pass\nUnresolved: none\n`);
  const head = git(root, 'rev-parse', 'HEAD');
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root, env: { EXO_PROOF_TIMEOUT_MS: '300' } });
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /failed \(timed out after 0\.3s\)/);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
});

test('a plan with no Land gate line lands as before', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const output = landTask({ planPath, planText: PLAN, number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
});

test('Land gate: none opts out and lands as before', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const output = landTask({ planPath, planText: withLandGate('none'), number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
});

test('a task that names Drops: gives its Proof the same EXO_DROPS as its Land gate', async () => {
  const proof = 'test "$EXO_DROPS" = "only in skills/x.md"';
  const plan = COMPACT_PLAN
    .replace('Proof: node tests/app.test.mjs', `Proof: ${proof}`)
    .replace('| Red: none (fixture)', '| Red: none (fixture) | Drops: only in skills/x.md')
    .replace('## Plan basis\n', '## Plan basis\nLand gate: test "$EXO_DROPS" = "only in skills/x.md"\n');
  const { root, planPath } = await compactCheckout(plan);
  const report = PASS_REPORT.replace('`node tests/app.test.mjs`: pass', `\`${proof}\`: pass`);
  const output = landTask({ planPath, planText: plan, number: 1, root, reportText: report });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.match(output, /^Proof: test "\$EXO_DROPS" = "only in skills\/x\.md": pass \(exit 0\)$/m);
});
