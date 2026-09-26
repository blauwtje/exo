// `run-plan` stays model-invocable, so the run commits only where the
// workspace question placed it and pushes, opens a pull request or merges only
// through the finish question `ship` asks. The model follows these rules by
// reading them; no pattern matches a run, so this test guards the skill text
// that states them.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { DEFAULT_MINUTES } from '../skills/ship/scripts/wait-checks.mjs';

const read = (relative) => fs.readFileSync(new URL(`../skills/${relative}`, import.meta.url), 'utf8');
const SKILL = read('run-plan/SKILL.md');
const WORKSPACE = read('run-plan/references/workspace.md');
const SHIPPING = read('ship/SKILL.md');

function loopStep(number) {
  const step = SKILL.match(new RegExp(`^${number}\\. \\*\\*.+$`, 'm'));
  assert.ok(step, `step ${number} exists`);
  return step[0];
}

test('step 1 settles the workspace before any dispatch and pushes nothing', () => {
  const branchStep = loopStep(1);
  assert.ok(branchStep.includes('settle where the run commits as `references/workspace.md` says, before any dispatch'));
  assert.ok(!branchStep.includes('git push'), 'step 1 runs no push');
  assert.ok(!branchStep.includes('release run'), 'no release run bypasses the question');
});

test('the workspace question offers a branch, a worktree and the current branch, recommended first', () => {
  // The three-item menu and its two recommended-first orders now live in
  // lib/workspace.mjs, exercised against real temporary git repositories by
  // tests/workspace.test.mjs's 'ask: workspace setting "ask" on the default
  // branch prints the menu, branch first' and 'ask: --current-recommended
  // reorders the menu, current branch first'; this test only guards that
  // workspace.md still sends the reader to that script and its `ask` outcome.
  assert.ok(WORKSPACE.includes('lib/workspace.mjs'), 'workspace.md names the script');
  assert.ok(WORKSPACE.includes('follow its one line'), 'workspace.md directs the reader to follow the script output');
  assert.ok(WORKSPACE.includes('`ask` puts its menu as the question'), 'workspace.md names the ask outcome');
  assert.ok(!WORKSPACE.includes('git push'), 'the workspace step pushes nothing');
});

test('a green task commits and pushes nothing', () => {
  const unit = fs.readFileSync(new URL('../agents/run-unit.md', import.meta.url), 'utf8');
  const commitStep = unit.match(/^4\. \*\*Commit a green task\.\*\*.+$/m)[0];
  assert.ok(commitStep.includes('push nothing'));
  assert.ok(!commitStep.includes('git push'), 'the unit commit step runs no push');
});

test('the tail pushes only through the finish question', () => {
  const tailStep = loopStep(7);
  assert.ok(tailStep.includes('Then end on `ship`'));
  assert.ok(!tailStep.includes('git push'), 'step 7 names no push of its own');
  const question = SHIPPING.indexOf('## The question');
  const firstShipScript = SHIPPING.indexOf('scripts/ship.mjs');
  assert.ok(question !== -1 && firstShipScript > question, 'the script that pushes is named only after the question');
  const merge = SHIPPING.indexOf('1. **PR + merge (Recommended)**:');
  const openPr = SHIPPING.indexOf('2. **Open PR**:');
  const push = SHIPPING.indexOf('3. **Push**:');
  const keep = SHIPPING.indexOf('4. **Keep local**:');
  assert.ok(merge !== -1 && merge < openPr && openPr < push && push < keep, 'the four routes in order');
});

test('ship merges only after the bounded wait and the API gate, and deletes no branch', () => {
  const wait = SHIPPING.indexOf('wait for checks');
  const gate = SHIPPING.indexOf('gate from the API');
  const merge = SHIPPING.indexOf('merge, confirm');
  assert.ok(wait !== -1 && wait < gate && gate < merge, 'wait, gate, merge, confirm in order');
  const SHIP_SCRIPT = read('ship/scripts/ship.mjs');
  assert.ok(!SHIP_SCRIPT.includes('--delete-branch') && !SHIP_SCRIPT.includes('--admin') && !SHIP_SCRIPT.includes('--auto'), 'ship.mjs never deletes, admin-merges or auto-merges a branch');
  assert.ok(SHIPPING.includes(`stops after ${DEFAULT_MINUTES} minutes`));
});

test('the authorization line grants no push before the finish answer and no merge', () => {
  const authorization = SKILL.match(/^Invoking `\/exo:run-plan` on a plan authorizes .+$/m);
  assert.ok(authorization, 'the authorization line exists');
  assert.ok(authorization[0].includes('a push or a pull request only after your answer to the finish question'));
  assert.ok(!authorization[0].includes('merge'), 'run-plan grants no merge');
});

test('build-change and find-cause settle the workspace and end on ship', () => {
  for (const skill of ['build-change', 'find-cause']) {
    const text = read(`${skill}/SKILL.md`);
    assert.ok(text.includes('`../run-plan/references/workspace.md`'), `${skill} names the workspace step`);
    assert.ok(text.includes('ends on `ship`') || text.includes('end on `ship`'), `${skill} names the finish`);
    assert.ok(!text.includes('git push'), `${skill} runs no push of its own`);
  }
});
