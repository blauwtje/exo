import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { compactPlanFixture, compactTask, fixture, gitRepository } from './harness.mjs';

const PLAN_CHECK = path.resolve('skills/spec/scripts/plan-check.mjs');

async function planCheck({ gate, proof = 'node --test' }) {
  const root = await gitRepository({ 'src/run.mjs': 'export {};\n' });
  const base = compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'Change the runner', files: ['src/run.mjs'], proof })] });
  const plan = base.replace('Branch: feat/fixture\n', `Branch: feat/fixture\nLand gate: ${gate}\n`);
  const planPath = path.join(await fixture(), 'plan.md');
  await fs.writeFile(planPath, plan);
  const result = spawnSync('node', [PLAN_CHECK, '--plan', planPath, '--root', root], { encoding: 'utf8' });
  return result.stdout;
}

test('a backticked Land gate is refused with a line naming the field and the fix', async () => {
  const out = await planCheck({ gate: '`npm run check`' });
  assert.match(out, /'Land gate: `npm run check`' wraps the command in backticks.*write 'Land gate: npm run check'/);
});

test('an unwrapped Land gate prints no backtick line', async () => {
  assert.doesNotMatch(await planCheck({ gate: 'npm run check' }), /wraps the command in backticks/);
});

test('an HTML entity in Land gate or Proof is refused naming the field', async () => {
  assert.match(await planCheck({ gate: 'npm test 2&gt;&amp;1' }), /Land gate: .*HTML entity '&gt;'/);
  assert.match(await planCheck({ gate: 'npm run check', proof: 'node --test a &gt; b' }), /Proof of Task 1: .*HTML entity '&gt;'/);
});

async function loopCriterion(command, env = process.env) {
  const root = await gitRepository({ 'src/run.mjs': 'export {};\n' });
  const base = compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'Change the runner', files: ['src/run.mjs'], proof: 'node --test' })] });
  const planPath = path.join(await fixture(), 'plan.md');
  await fs.writeFile(planPath, base.replace('`node --test` passes.', `\`${command}\` passes.`));
  return spawnSync('node', [PLAN_CHECK, '--loop', '--plan', planPath, '--root', root], { encoding: 'utf8', env }).stdout;
}

test('criterion runs: exit 127 is flagged and a failing exit 1 is not', async () => {
  assert.match(await loopCriterion('sh -c "exit 127"'), /Success criterion.*exit 127/);
  assert.doesNotMatch(await loopCriterion('sh -c "exit 1"'), /Success criterion.*(exit 127|timed out)/);
});

test('a timed-out criterion leaves no background process of its own alive', async () => {
  const pidFile = path.join(await fixture(), 'pid');
  const out = await loopCriterion(`sh -c 'sleep 30 & echo $! > ${pidFile}; wait'`, { ...process.env, EXO_CRITERION_TIMEOUT_MS: '300' });
  const pid = Number(await fs.readFile(pidFile, 'utf8'));
  const alive = (() => { try { process.kill(pid, 0); return true; } catch { return false; } })();
  if (alive) process.kill(pid, 'SIGKILL');
  assert.match(out, /Success criterion.*timed out after 300 ms/);
  assert.equal(alive, false);
});
