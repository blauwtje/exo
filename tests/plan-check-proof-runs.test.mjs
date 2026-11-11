import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { compactPlanFixture, compactTask, fixture, gitRepository } from './harness.mjs';

const PLAN_CHECK = path.resolve('skills/spec/scripts/plan-check.mjs');

async function planCheck({ proof, data = 'a plain object' }) {
  const root = await gitRepository({ 'src/run.mjs': 'export {};\n' });
  const plan = compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'Change the runner', files: ['src/run.mjs'], proof, data })] });
  const planPath = path.join(await fixture(), 'plan.md');
  await fs.writeFile(planPath, plan);
  return spawnSync('node', [PLAN_CHECK, '--plan', planPath, '--root', root], { encoding: 'utf8' }).stdout;
}

test('a Proof whose first word is a missing path warns', async () => {
  assert.match(await planCheck({ proof: 'scripts/prove.sh' }), /warning: Task 1: Proof starts with `scripts\/prove.sh`/);
});

test('a Proof that starts with a command warns of nothing', async () => {
  assert.doesNotMatch(await planCheck({ proof: 'node --test' }), /Proof starts with/);
});

test('a Data path that Files omits warns', async () => {
  assert.match(await planCheck({ proof: 'node --test', data: 'rows from `lib/other.mjs`' }), /warning: Task 1: Data: names `lib\/other.mjs`, which Files: omits/);
});

test('a Data path that Files lists warns of nothing', async () => {
  assert.doesNotMatch(await planCheck({ proof: 'node --test', data: 'rows from `src/run.mjs`' }), /Data: names/);
});

test('a Proof whose first command is not on PATH fails', async () => {
  assert.match(await planCheck({ proof: 'no-such-tool-xyz --run' }), /Task 1: Proof starts with `no-such-tool-xyz`, which is not on this host's PATH/);
  assert.match(await planCheck({ proof: '`no-such-tool-xyz --run`' }), /Task 1: Proof starts with `no-such-tool-xyz`, which is not on this host's PATH/);
});
