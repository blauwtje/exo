import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { SCRATCH_FOLDER } from '../lib/scratch-path.mjs';
import { commitFiles, git, planFixture, run } from './harness.mjs';
import { landingCheckout, taskSection } from './land-task-fixture.mjs';

const NEXT_TASK = new URL('../skills/build/scripts/next-task.mjs', import.meta.url).pathname;

const PLAN = planFixture({ tasks: [taskSection({ number: 1, title: 'Mine', files: ['- Create: `lib/mine.mjs`'], subject: 'feat(app): mine' })] });

async function checkpointCommit(root, file, trailer) {
  await commitFiles(root, { [file]: `${trailer}\n` }, `checkpoint: ${trailer}\n\nPlan-checkpoint: ${trailer}`);
  return git(root, 'rev-parse', '--short', 'HEAD');
}

async function writtenBrief({ root, planPath }) {
  const result = await run(NEXT_TASK, ['--plan', planPath, '--root', root], { cwd: root });
  return fs.readFile(result.stdout.match(/^Brief: (.+)$/m)[1], 'utf8');
}

async function writeHandoff(root, number) {
  const handoff = path.join(root, SCRATCH_FOLDER, `handoff-task-${number}.md`);
  await fs.mkdir(path.dirname(handoff), { recursive: true });
  await fs.writeFile(handoff, 'left off at step 2\n');
  return handoff;
}

async function planCheckout() {
  const checkout = await landingCheckout();
  await commitFiles(checkout.root, { 'docs/plans/fixture.md': PLAN }, 'chore: plan');
  return checkout;
}

test('a brief names the existing handoff file of its task', async () => {
  const checkout = await planCheckout();
  await writeHandoff(checkout.root, 2);
  assert.doesNotMatch(await writtenBrief(checkout), /^Handoff:/m);
  const handoff = await writeHandoff(checkout.root, 1);
  assert.match(await writtenBrief(checkout), new RegExp(`^Handoff: .*${handoff}`, 'm'));
});

test('a brief names the latest Plan-checkpoint commit of its task only', async () => {
  const checkout = await planCheckout();
  await checkpointCommit(checkout.root, 'one.txt', 'demo/1');
  const second = await checkpointCommit(checkout.root, 'two.txt', 'demo/1');
  await checkpointCommit(checkout.root, 'three.txt', 'demo/2');
  assert.match(await writtenBrief(checkout), new RegExp(`^Plan-checkpoint: ${second}$`, 'm'));
});

test('a brief with no handoff and no checkpoint names neither', async () => {
  const brief = await writtenBrief(await planCheckout());
  assert.doesNotMatch(brief, /^Handoff:/m);
  assert.doesNotMatch(brief, /^Plan-checkpoint:/m);
});
