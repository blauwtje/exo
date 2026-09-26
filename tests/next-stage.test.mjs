// next-stage.mjs prints the next-stage question's options, continuing first
// unless context-watch.mjs marked the session warned, and, for the stages
// `references/next-stage.md`'s table names, the one model line under them, reading a plan's `Design:` tasks and `## Visual
// direction` to pick the run-plan row.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { nextStageReport } from '../skills/route-skills/scripts/next-stage.mjs';
import { hotFile } from '../skills/show-savings/scripts/record.mjs';
import { fixture, gitRepository, planFixture, run, taskSection } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/route-skills/scripts/next-stage.mjs', import.meta.url));
const DRAFT_PLAN_MODEL_LINE = "Next stage runs on `opus` at `high`, because a plan's code is pasted as written, so a slip repeats in every task.";

// A savings directory holding one session's hot record at the path record.mjs
// keeps it, so the path next-stage.mjs spells out cannot drift from it;
// `warned` says whether context-watch.mjs's notice has fired.
async function savingsDirectory(sessionId, warned) {
  const directory = await fixture();
  const file = await withSavingsDirectory(directory, () => hotFile(sessionId));
  await fs.mkdir(path.dirname(file), { recursive: true });
  const hot = { contextWatch: { notifiedStep: warned ? 100 : null, warned } };
  await fs.writeFile(file, `${JSON.stringify(hot)}\n`);
  return directory;
}

async function withSavingsDirectory(directory, work) {
  const previous = process.env.EXO_SAVINGS_DIR;
  process.env.EXO_SAVINGS_DIR = directory;
  try {
    return await work();
  } finally {
    if (previous === undefined) delete process.env.EXO_SAVINGS_DIR;
    else process.env.EXO_SAVINGS_DIR = previous;
  }
}

test('with no session named, define-scope recommends continuing into draft-plan, Stop second', () => {
  const report = nextStageReport({ after: 'define-scope', artifact: 'docs/specs/topic.md' });
  assert.equal(report, [
    '1. **Draft-plan (Recommended)**: orders the brief into a plan.',
    '2. **Stop**: run `/exo:draft-plan docs/specs/topic.md` after a context clear.',
    DRAFT_PLAN_MODEL_LINE
  ].join('\n') + '\n');
});

test('a session the context watch has not warned recommends continuing', async () => {
  const directory = await savingsDirectory('quiet-session', false);
  const report = await withSavingsDirectory(directory, () =>
    nextStageReport({ after: 'define-scope', artifact: 'docs/specs/topic.md', sessionId: 'quiet-session' }));
  assert.match(report, /^1\. \*\*Draft-plan \(Recommended\)\*\*: /);
  assert.match(report, /\n2\. \*\*Stop\*\*: run `\/exo:draft-plan docs\/specs\/topic\.md` after a context clear\.\n/);
});

test('a session the context watch has warned recommends stopping with the command, continuing second', async () => {
  const directory = await savingsDirectory('warned-session', true);
  const report = await withSavingsDirectory(directory, () =>
    nextStageReport({ after: 'define-scope', artifact: 'docs/specs/topic.md', sessionId: 'warned-session' }));
  assert.equal(report, [
    '1. **Stop (Recommended)**: run `/exo:draft-plan docs/specs/topic.md` after a context clear.',
    '2. **Draft-plan**: orders the brief into a plan.',
    DRAFT_PLAN_MODEL_LINE
  ].join('\n') + '\n');
});

test('a session with no hot record yet recommends continuing', async () => {
  const directory = await fixture();
  const report = await withSavingsDirectory(directory, () =>
    nextStageReport({ after: 'find-cause', artifact: 'none', sessionId: 'unseen-session' }));
  assert.match(report, /^1\. \*\*Build-change \(Recommended\)\*\*: /);
});

test('draft-plan opens run-plan on sonnet when every Design: task holds a frozen direction', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Style', design: true, files: ['- Create: `src/app.css`'], subject: 'feat(app): style' })
  ] });
  const root = await gitRepository({ 'docs/plans/fixture.md': plan });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const report = nextStageReport({ after: 'draft-plan', artifact: planPath });
  assert.match(report, /^1\. \*\*Run-plan \(Recommended\)\*\*: runs the plan\.\n/);
  assert.match(report, /Next stage runs on `sonnet` at `medium`/);
});

test('draft-plan opens run-plan on opus when a Design: task is still pending', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Style', design: true, files: ['- Create: `src/app.css`'], subject: 'feat(app): style' })
  ] }).replace('Quiet record.', 'Direction: pending at rung 2');
  const root = await gitRepository({ 'docs/plans/fixture.md': plan });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const report = nextStageReport({ after: 'draft-plan', artifact: planPath });
  assert.match(report, /Next stage runs on `opus` at `medium`/);
});

test('find-cause opens build-change, unknown stage fails', async () => {
  const report = nextStageReport({ after: 'find-cause', artifact: 'none' });
  assert.match(report, /^1\. \*\*Build-change \(Recommended\)\*\*: builds the edits the proof left\.\n/);
  assert.match(report, /Next stage runs on `opus` at `high`, because it decides the change while building it\./);
  assert.throws(() => nextStageReport({ after: 'ship', artifact: 'none' }), /no next stage known/);
});

test('CLI prints the report for the flags given', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' })
  ] });
  const root = await gitRepository({ 'docs/plans/fixture.md': plan });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const directory = await savingsDirectory('warned-session', true);
  const env = { EXO_SAVINGS_DIR: directory, CLAUDE_CODE_SESSION_ID: '' };
  const unnamed = await run(SCRIPT, ['--after', 'draft-plan', '--artifact', planPath], { env });
  assert.equal(unnamed.code, 0, unnamed.stderr);
  assert.match(unnamed.stdout, /^1\. \*\*Run-plan \(Recommended\)\*\*: runs the plan\.\n2\. \*\*Stop\*\*: run `\/exo:run-plan/);
  const flagged = await run(SCRIPT, ['--after', 'draft-plan', '--artifact', planPath, '--session', 'warned-session'], { env });
  assert.equal(flagged.code, 0, flagged.stderr);
  assert.match(flagged.stdout, /^1\. \*\*Stop \(Recommended\)\*\*: run `\/exo:run-plan/);
  const fromEnvironment = await run(SCRIPT, ['--after', 'draft-plan', '--artifact', planPath], { env: { ...env, CLAUDE_CODE_SESSION_ID: 'warned-session' } });
  assert.equal(fromEnvironment.code, 0, fromEnvironment.stderr);
  assert.match(fromEnvironment.stdout, /^1\. \*\*Stop \(Recommended\)\*\*: run `\/exo:run-plan/);
});

test('CLI fails with a usage error when --session is not a session id', async () => {
  const directory = await fixture();
  const result = await run(SCRIPT, ['--after', 'find-cause', '--artifact', 'none', '--session', '../x'], { env: { EXO_SAVINGS_DIR: directory } });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /invalid session id/);
});

test('CLI fails with a usage error when --after is missing', async () => {
  const result = await run(SCRIPT, ['--artifact', 'none']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--after/);
});
