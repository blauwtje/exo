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
  assert.match(output, /^Land gate "echo ran >> gate\.log && exit 1" skipped: its last pass took 60000 ms, so gate runs it once\.$/m);
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
const survivorCommand = (marker) => `(sleep 1; touch ${marker}) & sleep 10`;

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
  await new Promise((resolve) => setTimeout(resolve, 1600));
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
  await new Promise((resolve) => setTimeout(resolve, 1600));
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

const EVIDENCE_PLAN = PLAN.replace('-m "Plan-task: 4"', '-m "Plan-task: 4" -m "Evidence: none (fixture)"');
const SEES_CANDIDATE = "git log -1 --format=%B | grep -q '^Evidence: none' && git ls-files --error-unmatch src/note.md";

async function twoFileEdit(root) {
  await editApp(root);
  await fs.writeFile(path.join(root, 'src/note.md'), 'note\n');
}

function planWithGate(command) {
  return EVIDENCE_PLAN.replace('Branch: feat/fixture', `Branch: feat/fixture\nLand gate: ${command}`);
}

test('the Land gate judges the task commit: its trailers and its new file are already in HEAD', async () => {
  const { root, planPath } = await landingCheckout();
  await twoFileEdit(root);
  const output = landTask({ planPath, planText: planWithGate(SEES_CANDIDATE), number: 4, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 4$/m);
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '2');
  const message = git(root, 'log', '-1', '--format=%B');
  assert.match(message, /^Plan-task: fixture\/4$/m);
  assert.match(message, /^Evidence: none \(fixture\)$/m);
  assert.doesNotMatch(message, /Plan-candidate/);
});

test('a failing Land gate resets the task commit and leaves the work staged', async () => {
  const { root, planPath } = await landingCheckout();
  await twoFileEdit(root);
  const base = git(root, 'rev-parse', 'HEAD');
  assert.throws(
    () => landTask({ planPath, planText: planWithGate('echo gate broke && exit 1'), number: 4, root }),
    /Land gate "echo gate broke && exit 1" failed:\ngate broke/
  );
  assert.equal(git(root, 'rev-parse', 'HEAD'), base);
  assert.equal(await fs.readFile(path.join(root, 'src/note.md'), 'utf8'), 'note\n');
});

test('a candidate commit left by a crashed landing is reset before the next landing', async () => {
  const { root, planPath } = await landingCheckout();
  await twoFileEdit(root);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'Task 4', '-m', 'Plan-candidate: fixture/4');
  const output = landTask({ planPath, planText: planWithGate('true'), number: 4, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 4$/m);
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '2');
  assert.doesNotMatch(git(root, 'log', '-1', '--format=%B'), /Plan-candidate/);
});

const PENDING_PLAN = PLAN.replace('### Task 4: Two files\n\nDepends on: none', '### Task 4: Two files\n\nDepends on: none | Evidence: none (fixture)');

const withGate = (plan, command) => plan.replace('Branch: feat/fixture', `Branch: feat/fixture\nLand gate: ${command}`);

test('the Land gate gets the Evidence value of a task not yet landed', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const gate = 'test "$EXO_PENDING_EVIDENCE" = "none (fixture)"';
  const output = landTask({ planPath, planText: withGate(PENDING_PLAN, gate), number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
});

test('the Land gate gets no pending Evidence for the task that carries it', async () => {
  const plan = withGate(COMPACT_PLAN.replace('| Red: none (fixture)', '| Red: none (fixture) | Evidence: none (fixture)'), 'test -z "$EXO_PENDING_EVIDENCE"');
  const { root, planPath } = await compactCheckout(plan);
  const output = landTask({ planPath, planText: plan, number: 1, root, reportText: PASS_REPORT });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.match(git(root, 'log', '-1', '--format=%B'), /^Evidence: none \(fixture\)$/m);
});

const LATER_TASK = '### Task 2: Later\nDepends on: none | Files: `src/later.js` | Data: a plain object | Proof: true | Red: none (fixture) | Evidence: none (fixture)\n\n### Task 1';

async function landProofOfTaskOne(proof, plan) {
  const { root, planPath } = await compactCheckout(plan);
  const report = PASS_REPORT.replace('`node tests/app.test.mjs`: pass', `\`${proof}\`: pass`);
  return landTask({ planPath, planText: plan, number: 1, root, reportText: report });
}

test('a Proof gets the Evidence value of a task not yet landed, as its Land gate does', async () => {
  const proof = 'test "$EXO_PENDING_EVIDENCE" = "none (fixture)"';
  const plan = withGate(COMPACT_PLAN.replace('Proof: node tests/app.test.mjs', `Proof: ${proof}`), 'true').replace('### Task 1', LATER_TASK);
  const output = await landProofOfTaskOne(proof, plan);
  assert.match(output, /^Proof: test "\$EXO_PENDING_EVIDENCE" = "none \(fixture\)": pass \(exit 0\)$/m);
});

test('a Proof gets the Evidence of the task that carries it, before its commit has the trailer', async () => {
  const proof = 'test "$EXO_PENDING_EVIDENCE" = "none (fixture)"';
  const plan = withGate(COMPACT_PLAN.replace('Proof: node tests/app.test.mjs', `Proof: ${proof}`).replace('| Red: none (fixture)', '| Red: none (fixture) | Evidence: none (fixture)'), 'true');
  const output = await landProofOfTaskOne(proof, plan);
  assert.match(output, /^Proof: test "\$EXO_PENDING_EVIDENCE" = "none \(fixture\)": pass \(exit 0\)$/m);
});

async function afterTaskOne() {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  landTask({ planPath, planText: PLAN, number: 1, root });
  await fs.writeFile(path.join(root, 'src/app.js'), 'export function greet() {\n  return "hi";\n}\n');
  await fs.writeFile(path.join(root, 'src/note.md'), 'note\n');
  return { root, planPath };
}

const LANDING_ARGS = (planPath, root, ...extra) => ['--plan', planPath, '--task', '4', '--root', root, ...extra];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('a --check and a landing running at once leave one task commit with only its files and the prior commit untouched', async () => {
  const { root, planPath } = await afterTaskOne();
  await fs.writeFile(planPath, withLandGate('sleep 1'));
  const prior = git(root, 'rev-parse', 'HEAD');
  const checking = run(SCRIPT, LANDING_ARGS(planPath, root, '--check'), { cwd: root });
  await pause(300);
  const landing = run(SCRIPT, LANDING_ARGS(planPath, root), { cwd: root });
  const [checked, landed] = await Promise.all([checking, landing]);
  assert.equal(checked.code, 0, checked.stderr);
  assert.equal(landed.code, 0, landed.stderr);
  assert.equal(git(root, 'rev-parse', 'HEAD~1'), prior);
  assert.match(git(root, 'log', '-1', '--format=%B'), /^Plan-task: fixture\/4$/m);
  const committed = git(root, 'show', '--name-only', '--format=', 'HEAD').split('\n').filter((file) => !file.startsWith('.exo/') && !file.startsWith('docs/plans/'));
  assert.deepEqual(committed.sort(), ['src/app.js', 'src/note.md']);
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '3');
});

test('a landing refuses and rewrites nothing when the Land gate moved HEAD off its candidate', async () => {
  const { root, planPath } = await afterTaskOne();
  const gate = "git commit -q --allow-empty -m 'other work'";
  const prior = git(root, 'rev-parse', 'HEAD');
  assert.throws(() => landTask({ planPath, planText: withLandGate(gate), number: 4, root }), /HEAD moved/);
  assert.equal(git(root, 'log', '-1', '--format=%s'), 'other work');
  assert.match(git(root, 'log', '-1', '--skip=1', '--format=%B'), /Plan-candidate: fixture\/4/);
  assert.equal(git(root, 'rev-parse', 'HEAD~2'), prior);
});

test('a passing --check writes its stamp, and a failing one leaves none', async () => {
  const { root, planPath } = await afterTaskOne();
  const stamp = path.join(root, '.exo/checked-4');
  await fs.writeFile(planPath, withLandGate('exit 1'));
  const failed = await run(SCRIPT, LANDING_ARGS(planPath, root, '--check'), { cwd: root });
  assert.equal(failed.code, 1, failed.stderr);
  await assert.rejects(fs.access(stamp));
  await fs.writeFile(planPath, withLandGate('sleep 1'));
  const checking = run(SCRIPT, LANDING_ARGS(planPath, root, '--check'), { cwd: root });
  await pause(500);
  await assert.rejects(fs.access(stamp));
  const checked = await checking;
  assert.equal(checked.code, 0, checked.stderr);
  assert.match(await fs.readFile(stamp, 'utf8'), /Report OK: Task 4/);
});

const COVERING_FAIL = "import { test } from 'node:test';\nconst read = 'src/app.js';\ntest('greet says hello', () => { throw new Error(`boom ${read}`); });\n";
const COVERING_PASS = COVERING_FAIL.replace('throw new Error(`boom ${read}`)', 'void read');

async function coveringCheckout(files, gate = 'true') {
  const plan = COMPACT_PLAN.replace('## Plan basis\n', `## Plan basis\nLand gate: ${gate}\n`);
  const checkout = await compactCheckout(plan);
  for (const [name, text] of Object.entries(files)) await fs.writeFile(path.join(checkout.root, name), text);
  git(checkout.root, 'add', ...Object.keys(files));
  git(checkout.root, 'commit', '-q', '-m', 'test: seed the covering tests');
  await writeReport(checkout.root, PASS_REPORT);
  return { ...checkout, plan };
}

function landFromCli({ root, planPath }, env = {}) {
  return run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root, env: { NODE_TEST_CONTEXT: undefined, ...env } });
}

const COVERING_HANG = COVERING_FAIL.replace(/test\('greet says hello'.*\n/, "test('greet says hello', () => new Promise((resolve) => setTimeout(resolve, 60_000)));\n");

test('out-of-scope: a failing covering test of a changed file refuses the land, naming the test file and its output', async () => {
  const checkout = await coveringCheckout({ 'tests/covers.test.mjs': COVERING_FAIL, 'tests/other.test.mjs': COVERING_FAIL.replace('src/app.js', 'src/none.js') });
  const head = git(checkout.root, 'rev-parse', 'HEAD');
  const result = await landFromCli(checkout);
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /Task 1: 1 covering test\(s\) of the changed files failed:\ntests\/covers\.test\.mjs failed \(exit 1\):/);
  assert.match(result.stderr, /greet says hello/);
  assert.doesNotMatch(result.stderr, /other\.test\.mjs/);
  assert.equal(git(checkout.root, 'rev-parse', 'HEAD'), head);
});

test('out-of-scope: a covering test that times out refuses the land, naming the test file and the timeout', async () => {
  const checkout = await coveringCheckout({ 'tests/covers.test.mjs': COVERING_HANG });
  const head = git(checkout.root, 'rev-parse', 'HEAD');
  const result = await landFromCli(checkout, { EXO_PROOF_TIMEOUT_MS: '2000' });
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /Task 1: 1 covering test\(s\) of the changed files failed:\ntests\/covers\.test\.mjs failed \(timed out after 2s\):/);
  assert.equal(git(checkout.root, 'rev-parse', 'HEAD'), head);
});

test('a failing Land gate refuses the land before any covering test runs', async () => {
  const checkout = await coveringCheckout({ 'tests/covers.test.mjs': COVERING_FAIL }, 'echo gate broke && exit 1');
  const result = await landFromCli(checkout);
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /Land gate "echo gate broke && exit 1" failed/);
  assert.doesNotMatch(result.stderr, /covering test/);
});

test('every failing covering test is named in one refusal', async () => {
  const checkout = await coveringCheckout({ 'tests/covers.test.mjs': COVERING_FAIL, 'tests/covers-too.test.mjs': COVERING_FAIL });
  const result = await landFromCli(checkout);
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /2 covering test\(s\)/);
  assert.match(result.stderr, /tests\/covers-too\.test\.mjs failed/);
  assert.match(result.stderr, /tests\/covers\.test\.mjs failed/);
});

test('a passing covering test lets the task land', async () => {
  const checkout = await coveringCheckout({ 'tests/covers.test.mjs': COVERING_PASS });
  const result = await landFromCli(checkout);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Committed: [0-9a-f]+ Task 1$/m);
});
