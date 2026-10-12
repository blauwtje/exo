// run-tail.mjs through run-plan.mjs: a plan whose Task 1 has a Risk: gets a review session; findings marked
// fix get one fix session, a fix-diff review and one landed fix commit. A stub claude plays each session.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseReviewLines } from '../skills/build/scripts/run-tail.mjs';
import { git, run } from './harness.mjs';
import { setup } from './run-plan-fixture.mjs';

const RUNNER = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));
const PLUGIN_ROOT = await fs.realpath(fileURLToPath(new URL('..', import.meta.url)));
// Task 1 carries a Risk:, so its commit adds a test file as the gate's test-first check wants.
const land = (number) => ({ commits: [{ file: number === 1 ? 'a.txt' : 'b.txt', also: number === 1 ? ['a.test.mjs'] : [], trailers: [`Plan-task: plan/${number}`] }] });
const FINDING = 'FINDINGS\n\na.txt:1-1; defect; swallowed failure; catch drops error; fix\n  Probe: node --version\n';
const FINDINGS_LINE = 'verdict=FINDINGS defect=1 hazard=0 question=0 fix=1 report=x';
const CLEAN_LINE = 'verdict=CLEAN defect=0 hazard=0 question=0 fix=0 report=x';

async function runSteps(steps) {
  const context = await setup({ risk: 'security boundary' });
  const scenario = path.join(context.tools, 'scenario.json');
  const record = path.join(context.tools, 'calls.jsonl');
  await fs.writeFile(scenario, JSON.stringify({ pluginPath: PLUGIN_ROOT, planPath: context.plan, steps }));
  const result = await run(RUNNER, [context.plan, '--root', context.root, '--claude', context.stub, '--session', 'task'], {
    cwd: context.root,
    env: { STUB_SCENARIO: scenario, STUB_RECORD: record, CLAUDECODE: '1', HOME: context.home }
  });
  const calls = (await fs.readFile(record, 'utf8').catch(() => '')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const stop = result.stdout.match(/^run-plan: stop: .*$/m)?.[0] ?? (await fs.readFile(result.stdout.match(/^Details: (.+)$/m)[1], 'utf8')).trim().split('\n').at(-1);
  const ledger = (await fs.readFile(path.join(path.dirname(result.stdout.match(/^Details: (.+)$/m)[1]), 'sessions.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  return { ...context, result, calls, stop, ledger, subjects: git(context.root, 'log', '--format=%s').split('\n') };
}

test('parseReviewLines: deep and light REVIEW lines, OVERLAP targets and REVIEWED records', () => {
  const parsed = parseReviewLines([
    'REVIEW Task 1 abc1234,def5678: review-branch model=opus effort=high',
    'REVIEW Task 2 1234567: review-branch',
    'REVIEW Task 3 7654321: none (inline route)',
    'REVIEWED Task 4 /r/.exo/review-aaaaaaa.md',
    'OVERLAP lib/x.mjs (Tasks 1, 2)'
  ].join('\n'));
  assert.deepEqual(parsed.reviews, [{ number: 1, shas: 'abc1234,def5678', model: 'opus' }, { number: 2, shas: '1234567', model: null }]);
  assert.deepEqual(parsed.overlaps, ['lib/x.mjs']);
  assert.deepEqual(parsed.reviewed, ['/r/.exo/review-aaaaaaa.md']);
  assert.deepEqual(parseReviewLines('OVERLAP none').overlaps, []);
});

test('fix=1: one fix session, a clean fix-diff review and one fix commit, with no skill prompt', async () => {
  const context = await runSteps([
    land(1), land(2),
    { result: FINDINGS_LINE, findings: FINDING },
    { result: 'fixed=1 reported=0 report=x', edits: ['a.txt'] },
    { result: CLEAN_LINE, findings: 'CLEAN\n' }
  ]);
  assert.equal(context.stop, 'run-plan: stop: done, 2/2 tasks landed, gate PASS', context.result.stdout + context.result.stderr);
  assert.equal(context.calls.length, 5);
  for (const call of context.calls) assert.doesNotMatch(call.stdin, /^\/exo:/);
  assert.deepEqual(context.calls.map((call) => call.pin), ['plan/1', 'plan/2', null, null, null]);
  assert.match(context.calls[2].stdin, /^## Review/m);
  assert.ok(!context.calls[2].stdin.startsWith('---'), 'no frontmatter');
  assert.match(context.calls[2].stdin, /^- Scope: task [0-9a-f]{7,}/m);
  assert.match(context.calls[3].stdin, /^Review fix for .*plan\.md, repository /);
  assert.match(context.calls[4].stdin, /^- Scope: fix diff$/m);
  const tools = (call) => call.argv[call.argv.indexOf('--tools') + 1];
  assert.deepEqual(context.calls.slice(2).map(tools), ['Read,Write,Glob,Grep,Bash', 'Read,Edit,Write,Bash,Grep,Glob', 'Read,Write,Glob,Grep,Bash']);
  assert.equal(context.subjects[0], 'fix(a): address the branch review');
  assert.deepEqual(context.ledger.map((line) => line.kind), ['task', 'task', 'review', 'fix', 'review']);
  assert.match(await fs.readFile(path.join(context.root, '.exo', 'branch-review.md'), 'utf8'), /^FINDINGS/);
});

test('a fix-diff review that still holds a fix finding leaves the fix uncommitted and stops the run', async () => {
  const context = await runSteps([
    land(1), land(2),
    { result: FINDINGS_LINE, findings: FINDING },
    { result: 'fixed=1 reported=0 report=x', edits: ['a.txt'] },
    { result: FINDINGS_LINE, findings: FINDING }
  ]);
  assert.match(context.stop, /^run-plan: stop: fix review FINDINGS$/);
  assert.ok(!context.subjects.some((subject) => subject.startsWith('fix(')));
  assert.match(git(context.root, 'status', '--porcelain'), /a\.txt/);
  assert.equal(context.result.code, 1);
});

test('a fix session that changes nothing lands no fix commit and ends on the gate', async () => {
  const context = await runSteps([
    land(1), land(2),
    { result: FINDINGS_LINE, findings: FINDING },
    { result: 'fixed=0 reported=0 report=x' },
    { result: CLEAN_LINE, findings: 'CLEAN\n' }
  ]);
  assert.equal(context.stop, 'run-plan: stop: done, 2/2 tasks landed, gate PASS', context.result.stdout + context.result.stderr);
  assert.equal(context.calls.length, 5);
  assert.ok(!context.subjects.some((subject) => subject.startsWith('fix(')));
  assert.match(context.result.stdout, /fix landed: nothing to commit/);
});

test('a review with no findings file merges as BLOCKED and stops before any fix session', async () => {
  const context = await runSteps([land(1), land(2), { result: CLEAN_LINE }]);
  assert.equal(context.stop, 'run-plan: stop: branch review BLOCKED');
  assert.equal(context.calls.length, 3);
});

test('fix=0 findings run no fix session and end on the gate', async () => {
  const context = await runSteps([land(1), land(2), { result: 'verdict=FINDINGS defect=1 hazard=0 question=0 fix=0 report=x', findings: 'FINDINGS\n\na.txt:1-1; hazard; style; evidence; report\n' }]);
  assert.equal(context.stop, 'run-plan: stop: done, 2/2 tasks landed, gate PASS', context.result.stdout);
  assert.equal(context.calls.length, 3);
});
