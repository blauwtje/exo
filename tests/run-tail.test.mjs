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

const REVIEW_STUB = `
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const scenario = JSON.parse(fs.readFileSync(process.env.STUB_SCENARIO, 'utf8'));
const stdin = fs.readFileSync(0, 'utf8');
if (!/^## Review/m.test(stdin)) {
  const standard = spawnSync(process.execPath, [scenario.standardStub, ...process.argv.slice(2)], { input: stdin, encoding: 'utf8' });
  process.stdout.write(standard.stdout);
  process.exit(standard.status);
}
const stops = scenario.stopTitle !== undefined && stdin.includes(scenario.stopTitle);
const init = { type: 'system', subtype: 'init', cwd: process.cwd(), session_id: 'review', permissionMode: 'dontAsk',
  plugins: [{ name: 'exo', path: scenario.pluginPath, source: 'exo@local', version: '0.0.0' }] };
if (stops) init.plugin_errors = [{ plugin: 'exo', type: 'generic-error', message: 'review stub stops' }];
process.stdout.write(JSON.stringify(init) + '\\n');
const start = Date.now();
await new Promise((resolve) => setTimeout(resolve, stops ? 0 : scenario.reviewMs));
const findings = stdin.match(/^- Findings path: (.+)$/m)[1];
fs.mkdirSync(path.dirname(findings), { recursive: true });
fs.writeFileSync(findings, 'CLEAN\\n');
fs.appendFileSync(scenario.timings, JSON.stringify({ start, end: Date.now() }) + '\\n');
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, num_turns: 1, total_cost_usd: 0.01, permission_denials: [], result: 'verdict=CLEAN defect=0 hazard=0 question=0 fix=0 report=x', session_id: 'review' }) + '\\n');
`;

async function useReviewTasks(context, count) {
  const text = await fs.readFile(context.plan, 'utf8');
  const tasks = Array.from({ length: count }, (_, index) => index + 1).flatMap((number) => [
    `### Task ${number}: feat(t${number}): add t${number}`,
    `Depends on: ${number === 1 ? 'none' : number - 1} | Files: \`t${number}.txt\`, \`t${number}.test.mjs\` | Data: a line | Risk: security boundary | Proof: node --version | Red: none (fixture)`
  ]);
  await fs.writeFile(context.plan, `${text.split('### Task 1')[0]}${tasks.join('\n')}\n`);
  git(context.root, 'commit', '-q', '-am', 'docs: use review tasks');
}

const landReviewTask = (number) => ({ commits: [{ file: `t${number}.txt`, also: [`t${number}.test.mjs`], trailers: [`Plan-task: plan/${number}`] }] });

async function runReviews({ count, stopTitle }) {
  const steps = Array.from({ length: count }, (_, index) => landReviewTask(index + 1));
  return runSteps(steps, { taskCount: count, review: { reviewMs: 600, stopTitle } });
}

const concurrencyOf = (timings) => Math.max(...timings.map((timing) => timings.filter((other) => other.start <= timing.start && other.end > timing.start).length));

async function runSteps(steps, { taskCount = null, review = null } = {}) {
  const context = await setup({ risk: 'security boundary' });
  if (taskCount !== null) await useReviewTasks(context, taskCount);
  const scenario = path.join(context.tools, 'scenario.json');
  const record = path.join(context.tools, 'calls.jsonl');
  const timings = path.join(context.tools, 'timings.jsonl');
  const claude = path.join(context.tools, 'review-claude.mjs');
  await fs.writeFile(claude, REVIEW_STUB);
  await fs.writeFile(scenario, JSON.stringify({ pluginPath: PLUGIN_ROOT, planPath: context.plan, steps, standardStub: context.stub, timings, ...review }));
  const result = await run(RUNNER, [context.plan, '--root', context.root, '--claude', review === null ? context.stub : claude, '--session', 'task'], {
    cwd: context.root,
    env: { STUB_SCENARIO: scenario, STUB_RECORD: record, CLAUDECODE: '1', HOME: context.home }
  });
  const calls = (await fs.readFile(record, 'utf8').catch(() => '')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const stop = result.stdout.match(/^run-plan: stop: .*$/m)?.[0] ?? (await fs.readFile(result.stdout.match(/^Details: (.+)$/m)[1], 'utf8')).trim().split('\n').at(-1);
  const ledger = (await fs.readFile(path.join(path.dirname(result.stdout.match(/^Details: (.+)$/m)[1]), 'sessions.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  const timed = (await fs.readFile(timings, 'utf8').catch(() => '')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return { ...context, result, calls, stop, ledger, timings: timed, subjects: git(context.root, 'log', '--format=%s').split('\n') };
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

test('four reviews run three at a time: they overlap, never more than three, and the fourth waits', async () => {
  const context = await runReviews({ count: 4 });
  assert.equal(context.stop, 'run-plan: stop: done, 4/4 tasks landed, gate PASS', context.result.stdout + context.result.stderr);
  assert.equal(context.timings.length, 4);
  assert.equal(concurrencyOf(context.timings), 3);
  const byStart = [...context.timings].sort((first, second) => first.start - second.start);
  assert.ok(byStart[3].start >= Math.min(...byStart.slice(0, 3).map((timing) => timing.end)));
});

test('a stopping review lets its siblings finish before the run returns that stop', async () => {
  const context = await runReviews({ count: 3, stopTitle: 'feat(t1)' });
  assert.match(context.stop, /exo not loaded/);
  assert.equal(context.timings.length, 2);
});
