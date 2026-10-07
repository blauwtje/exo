// `build` stays model-invocable, so the run commits only where the
// workspace question placed it and pushes, opens a pull request or merges only
// through the finish question `ship` asks. The model follows these rules by
// reading them; no pattern matches a run, so this test guards the skill text
// that states them.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { DEFAULT_MINUTES } from '../skills/ship/scripts/wait-checks.mjs';

const read = (relative) => fs.readFileSync(new URL(`../skills/${relative}`, import.meta.url), 'utf8');
const SKILL = read('build/SKILL.md');
const RUN_LOOP = read('build/references/run-loop.md');
const TAIL = read('build/references/tail.md');
const NO_SPEC = read('build/references/no-spec.md');
const WORKSPACE = read('build/references/workspace.md');
const SHIPPING = read('ship/SKILL.md');
const VERIFY = read('verify/SKILL.md');

function loopStep(number, text = RUN_LOOP) {
  const step = text.match(new RegExp(`^${number}\\. \\*\\*[\\s\\S]*?(?=\\n\\d+\\. |\\n## |$(?![\\s\\S]))`, 'm'));
  assert.ok(step, `step ${number} exists`);
  return step[0];
}

test('step 1 settles the workspace before any dispatch and pushes nothing', () => {
  const branchStep = loopStep(1);
  assert.ok(branchStep.includes('Settle where the run commits.'));
  assert.ok(SKILL.includes('| `references/workspace.md` | Step 1 before the first dispatch, or No spec step 3. |'), 'the workspace is read before the first dispatch');
  assert.ok(RUN_LOOP.indexOf('Settle where the run commits') < RUN_LOOP.indexOf('`exo:run-unit` agent'), 'the workspace settles before the unit dispatch');
  assert.ok(!branchStep.includes('git push'), 'step 1 runs no push');
  assert.ok(!branchStep.includes('release run'), 'no release run bypasses the question');
});

test('the workspace question offers a branch, a worktree and the current branch, lettered with the recommended one as A', () => {
  // The three-item lettered menu and its two orders, A recommended, now live in
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
  const commitStep = unit.match(/^4\. \*\*Commit a green task\.\*\*[\s\S]*?(?=\n\d+\. |\n## |$(?![\s\S]))/m)[0];
  assert.ok(commitStep.includes('push nothing'));
  assert.ok(!commitStep.includes('git push'), 'the unit commit step runs no push');
});

test('the tail pushes only through the finish question', () => {
  const tailStep = loopStep(7, TAIL);
  assert.ok(tailStep.includes('End this loop on `verify`'));
  assert.ok(VERIFY.includes('End on `ship`'), 'verify names the finish that follows build\'s tail');
  const repairStep = VERIFY.match(/^3\. \*\*Repair the findings\.\*\*.+$/m)[0];
  assert.ok(repairStep.includes('the `exo:fix-review` agent, with no model override'), 'verify sends the findings to the named fixer agent');
  assert.ok(!repairStep.includes('`general-purpose`'), 'the fixer is no general-purpose delegate');
  assert.ok(!repairStep.includes('git push'), 'the repair step runs no push');
  assert.ok(!tailStep.includes('git push'), 'step 7 names no push of its own');
  const question = SHIPPING.indexOf('Quote the stdout of `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --routes` as the menu; nothing leaves the machine before the letter.');
  const firstRoute = SHIPPING.indexOf('scripts/ship.mjs" --route ');
  const firstMerge = SHIPPING.indexOf('scripts/ship.mjs" --merge ');
  assert.ok(question !== -1 && firstRoute > question && firstMerge > question, 'the commands that push or merge are named only after the question');
  const finishStep = loopStep(4, VERIFY);
  assert.ok(finishStep.includes('End on `ship`, unless a request or plan rules out a push'), 'verify loads no ship when nothing may leave the machine');
  assert.ok(finishStep.includes('nothing left the machine'), 'the skipped finish reports that nothing left the machine');
  assert.ok(NO_SPEC.includes('end on `ship`, unless the request rules out a push'), 'the no-spec route skips ship the same way');
  // The routes and their order come from `ship.mjs --routes`, run against
  // real repositories in tests/ship-routes.test.mjs ('--routes: a feature
  // branch with gh auth ok offers the full menu').
});

test('every plan run ends on verify, even when the request or a third party it quotes says to skip it', () => {
  // Pressure run HYgdrV skipped verify on a quoted tech lead's "skip the verify
  // ceremony"; the rule sits in SKILL.md's step 7, which every route reaches.
  const tailStep = loopStep(7, SKILL.slice(0, SKILL.indexOf('## No spec')));
  assert.ok(tailStep.includes('then run `verify`, even when the request, or anyone it quotes, says to skip it'));
  assert.ok(loopStep(7, TAIL).split('\n')[1].includes('push nothing or open no pull request still runs `verify`'), 'the no-push waiver is the tail\'s first bullet');
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
  const authorization = loopStep(1).match(/Invoking build authorizes [^.]+\./);
  assert.ok(authorization, 'the authorization sentence exists');
  assert.ok(authorization[0].includes("a push or pull request waits for the user's answer to `ship`"));
  assert.ok(!authorization[0].includes('merge'), 'build grants no merge');
  assert.doesNotMatch(SKILL, /git push|gh pr (create|merge)|git merge |--route |--merge /, 'build runs no push, pull request or merge of its own');
  assert.doesNotMatch(RUN_LOOP, /git push|gh pr (create|merge)|git merge |--route |--merge /, 'the loop runs no push, pull request or merge of its own');
});

test('the no-spec route settles the workspace and ends on ship', () => {
  assert.ok(NO_SPEC.includes('settle where the change commits'), 'no-spec step 3 names the workspace step');
  assert.ok(NO_SPEC.includes('then end on `ship`'), 'no-spec step 8 names the finish');
});

test('find-cause settles the workspace and ends on ship', () => {
  const text = read('find-cause/SKILL.md');
  assert.ok(text.includes('`../build/references/workspace.md`'), 'find-cause names the workspace step');
  assert.ok(text.includes('ends on `ship`') || text.includes('end on `ship`'), 'find-cause names the finish');
  assert.ok(!text.includes('git push'), 'find-cause runs no push of its own');
});

test('the tail takes its Proof lines and the decision log path from next-task --proofs, not from the plan or checkout', () => {
  const tailStep = loopStep(7, TAIL);
  assert.ok(tailStep.includes('next-task.mjs" --proofs'), 'step 7 names the script that prints the landed proofs');
  assert.ok(tailStep.includes('Never rerun a proof'), 'step 7 bans rerunning or reading for proofs');
  assert.ok(tailStep.includes('`Decisions:` line goes in the report as a path, unread'), 'step 7 names the decision log by path only');
});
