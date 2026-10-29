import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readKindTable } from '#model-kinds';
import { gradeRepair, loadFixtures } from '../benchmarks/review-replay.mjs';
import { loadValueTasks, prepareValueRepo, scoreValueRepo } from '../benchmarks/value.mjs';
import { Budget, candidatesFor, dryRunText, estimateTotal, estimateUsd, flaggedShare, parseCandidate, planJobs, resolveFixtures, sessionCost, settingOf, summarizeCells, usageOfStream } from '../benchmarks/agent-tier.mjs';

const AGENTS = ['locate-code', 'review-branch', 'fix-review', 'build-task', 'solve-hard'];
const CONFIG = {
  'locate-code': { metric: 'recall', fixtures: { quick: ['a'], full: ['a', 'b'] }, profile: { input: 1_000_000, cacheRead: 0, output: 0 } },
  'solve-hard': { metric: 'pass', fixtures: { quick: ['c'], full: ['c', 'd', 'e'] }, profile: { input: 0, cacheRead: 0, output: 1_000_000 } }
};
const PLANTS = [{ path: 'a.mjs', range: '3-5', class: 'copied-block' }, { path: 'b.mjs', range: '10', class: 'dead-code' }];

test('candidatesFor lists the current setting, two lower efforts and one lower model', () => {
  assert.deepEqual(candidatesFor({ model: 'opus', effort: 'high' }), [
    { model: 'opus', effort: 'high' }, { model: 'opus', effort: 'medium' }, { model: 'opus', effort: 'low' }, { model: 'sonnet', effort: 'high' }
  ]);
});

test('candidatesFor stops at low effort and at the lowest model', () => {
  assert.deepEqual(candidatesFor({ model: 'sonnet', effort: 'medium' }), [
    { model: 'sonnet', effort: 'medium' }, { model: 'sonnet', effort: 'low' }, { model: 'haiku', effort: 'medium' }
  ]);
  assert.deepEqual(candidatesFor({ model: 'haiku', effort: 'low' }), [{ model: 'haiku', effort: 'low' }]);
});

test('parseCandidate reads model:effort and refuses anything else', () => {
  assert.deepEqual(parseCandidate('haiku:xhigh'), { model: 'haiku', effort: 'xhigh' });
  for (const bad of ['haiku', 'gpt:low', 'sonnet:fast', 'sonnet:low:x']) assert.throws(() => parseCandidate(bad), /--candidate/);
});

test('settingOf reads the model and effort of each benchmarked agent from the kind table', () => {
  const table = readKindTable();
  assert.deepEqual(settingOf('locate-code', table), { model: 'sonnet', effort: 'medium' });
  assert.deepEqual(settingOf('review-branch', table), { model: 'opus', effort: 'medium' });
  assert.deepEqual(settingOf('fix-review', table), { model: 'sonnet', effort: 'low' });
  assert.deepEqual(settingOf('build-task', table), { model: 'sonnet', effort: 'low' });
  assert.deepEqual(settingOf('solve-hard', table), { model: 'opus', effort: 'high' });
  assert.throws(() => settingOf('run-unit-x', table), /not in lib\/model-kinds.json/);
});

test('planJobs crosses candidates with the tier fixtures, and --candidate replaces the ladder', () => {
  const table = readKindTable();
  const ladder = planJobs({ config: CONFIG, agents: ['locate-code'], tier: 'full', candidates: null, table });
  assert.equal(ladder.length, 6);
  const chosen = planJobs({ config: CONFIG, agents: ['solve-hard'], tier: 'quick', candidates: [parseCandidate('haiku:low')], table });
  assert.deepEqual(chosen, [{ agent: 'solve-hard', candidate: { model: 'haiku', effort: 'low' }, fixture: 'c' }]);
});

test('estimateUsd prices the profile, and a recorded median for the same agent, model and effort wins', () => {
  const candidate = { model: 'sonnet', effort: 'medium' };
  const priced = estimateUsd('locate-code', candidate, [], CONFIG);
  assert.ok(priced > 0);
  const recorded = [
    { agent: 'locate-code', model: 'sonnet', effort: 'medium', cost_usd: 0.1 },
    { agent: 'locate-code', model: 'sonnet', effort: 'medium', cost_usd: 0.3 },
    { agent: 'locate-code', model: 'sonnet', effort: 'low', cost_usd: 9 }
  ];
  assert.equal(estimateUsd('locate-code', candidate, recorded, CONFIG), 0.2);
});

test('dry-run total sums the per-session estimates and names each agent', () => {
  const jobs = [
    { agent: 'locate-code', candidate: { model: 'haiku', effort: 'low' }, fixture: 'a' },
    { agent: 'locate-code', candidate: { model: 'haiku', effort: 'low' }, fixture: 'b' },
    { agent: 'solve-hard', candidate: { model: 'haiku', effort: 'low' }, fixture: 'c' }
  ];
  const each = jobs.map((job) => estimateUsd(job.agent, job.candidate, [], CONFIG));
  assert.equal(estimateTotal(jobs, [], CONFIG), each[0] + each[1] + each[2]);
  const text = dryRunText(jobs, [], CONFIG);
  assert.match(text, /^locate-code: 2 sessions/m);
  assert.match(text, /^solve-hard: 1 sessions/m);
  assert.match(text, new RegExp(`^total: 3 sessions, est \\$${estimateTotal(jobs, [], CONFIG).toFixed(2).replace('.', '\\.')}`, 'm'));
});

test('flaggedShare counts planted ranges overlapped by a defect or concern finding', () => {
  const text = 'a.mjs:4; defect copied-block; fix\nb.mjs:1-2; defect elsewhere; fix\nb.mjs:10; note dead-code; report\n';
  assert.equal(flaggedShare(PLANTS, text), 0.5);
  assert.equal(flaggedShare(PLANTS, `${text}b.mjs:9-11; concern dead-code; report\n`), 1);
  assert.equal(flaggedShare(PLANTS, 'nothing'), 0);
  assert.equal(flaggedShare([], text), null);
});

test('Budget skips a job that would pass the cap and settles reserved estimates', () => {
  const budget = new Budget(1);
  assert.equal(budget.reserve(0.6), true);
  assert.equal(budget.reserve(0.6), false);
  budget.settle(0.6, 0.2);
  assert.equal(budget.reserve(0.6), true);
  assert.equal(budget.skipped, 1);
  assert.match(budget.message(), /--max-usd \$1 reached after \$0\.20: 1 sessions skipped/);
});

test('Budget without a cap never skips and has no message', () => {
  const budget = new Budget(null);
  assert.equal(budget.reserve(1e9), true);
  assert.equal(budget.message(), null);
});

test('usageOfStream and sessionCost price the result usage and fall back to cost_usd', () => {
  const stream = JSON.stringify({ type: 'result', usage: { input_tokens: 1_000_000, output_tokens: 0 } });
  assert.deepEqual(usageOfStream(stream), { input_tokens: 1_000_000, output_tokens: 0 });
  assert.equal(usageOfStream('not json'), null);
  assert.ok(sessionCost({ stdout: stream, cost_usd: 99 }, 'sonnet') < 99);
  assert.equal(sessionCost({ stdout: '', cost_usd: 0.4 }, 'sonnet'), 0.4);
  assert.equal(sessionCost({ stdout: '' }, 'sonnet'), null);
});

test('summarizeCells averages scores per agent and setting and leaves errors and skips out', () => {
  const sessions = [
    { agent: 'a', model: 'haiku', effort: 'low', score: 1, cost_usd: 0.1, durationMs: 10_000 },
    { agent: 'a', model: 'haiku', effort: 'low', score: 0, cost_usd: 0.1, durationMs: 20_000 },
    { agent: 'a', model: 'haiku', effort: 'low', error: 'timeout', cost_usd: null, durationMs: 30_000 },
    { agent: 'a', model: 'sonnet', effort: 'low', skipped: true }
  ];
  const [low, skipped] = summarizeCells(sessions);
  assert.equal(low.score, 0.5);
  assert.equal(low.graded, 2);
  assert.equal(low.cost_usd, 0.2);
  assert.equal(low.wallS, 20);
  assert.equal(skipped.score, null);
});

test('the shipped agents.json names fixtures that exist on disk for every agent in both tiers', async () => {
  const { default: shipped } = await import('../benchmarks/agent-tier/agents.json', { with: { type: 'json' } });
  assert.deepEqual(Object.keys(shipped), AGENTS);
  const table = readKindTable();
  for (const tier of ['quick', 'full']) {
    const jobs = planJobs({ config: shipped, agents: AGENTS, tier, candidates: null, table });
    assert.doesNotThrow(() => resolveFixtures(jobs));
  }
});

const REVIEW_ROOT = path.join(import.meta.dirname, '..', 'benchmarks', 'agent-tier', 'review');
const MIN_FULL_CASES = 10;

test('locate-code, review-branch and fix-review each hold at least ten distinct full-tier cases', async () => {
  const { default: shipped } = await import('../benchmarks/agent-tier/agents.json', { with: { type: 'json' } });
  for (const agent of ['locate-code', 'review-branch', 'fix-review']) {
    const full = shipped[agent].fixtures.full;
    assert.ok(new Set(full).size >= MIN_FULL_CASES, `${agent} full ${full.length}`);
  }
});

test('every benchmarks/agent-tier/review fixture plants one class inside its stripped source and ships good and bad references', () => {
  const fixtures = loadFixtures(REVIEW_ROOT);
  assert.ok(fixtures.length > 0);
  for (const fixture of fixtures) {
    const lines = fs.readFileSync(path.join(fixture.dir, `${fixture.file}.seed`), 'utf8').trimEnd().split('\n').length;
    assert.ok(fixture.plants.length >= 2 && fixture.plants.length <= 3, `${fixture.id} plants ${fixture.plants.length}`);
    assert.equal(new Set(fixture.plants.map((plant) => plant.class)).size, 1, fixture.id);
    for (const plant of fixture.plants) {
      const [start, end = start] = plant.range.split('-').map(Number);
      assert.equal(plant.path, fixture.file, fixture.id);
      assert.ok(start >= 1 && start <= end && end <= lines, `${fixture.id} ${plant.range}`);
    }
    const { good, bad } = JSON.parse(fs.readFileSync(path.join(fixture.dir, 'references.json'), 'utf8'));
    const grade = (ranges) => gradeRepair(
      fixture.plants,
      ranges.map(({ path: file, range }) => `${file}:${range} defect: reference range; fix`).join('\n'),
      ranges.map(({ path: file, range }) => {
        const [start, end = start] = range.split('-').map(Number);
        const count = end - start + 1;
        return `--- a/${file}\n+++ b/${file}\n@@ -${start},${count} +${start},${count} @@`;
      }).join('\n')
    );
    const fixed = grade(good);
    assert.equal(fixed.fixed, fixed.planted, `${fixture.id} good`);
    assert.equal(fixed.falseFix, 0, `${fixture.id} good false fix`);
    const missed = grade(bad);
    assert.ok(missed.fixed < missed.planted && missed.falseFix > 0, `${fixture.id} bad`);
  }
});

test('review fixture ids stay distinct from the canonical review-replay ids', () => {
  const canonical = new Set(loadFixtures().map((fixture) => fixture.id));
  for (const fixture of loadFixtures(REVIEW_ROOT)) assert.ok(!canonical.has(fixture.id), fixture.id);
});

const AGENT_VALUE_ROOT = path.join(import.meta.dirname, '..', 'benchmarks', 'agent-tier', 'value');

test('build-task and solve-hard each hold ten distinct full-tier cases that resolve', async () => {
  const { default: shipped } = await import('../benchmarks/agent-tier/agents.json', { with: { type: 'json' } });
  const table = readKindTable();
  for (const agent of ['build-task', 'solve-hard']) {
    assert.equal(new Set(shipped[agent].fixtures.full).size, MIN_FULL_CASES, agent);
    const jobs = planJobs({ config: shipped, agents: [agent], tier: 'full', candidates: null, table });
    assert.doesNotThrow(() => resolveFixtures(jobs));
  }
});

async function scoreValueRoot(task, solved) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-agent-tier-value-'));
  try {
    const startTree = prepareValueRepo(task, repo);
    if (solved) fs.cpSync(path.join(task.directory, 'solution'), repo, { recursive: true, force: true });
    return await scoreValueRepo(task, repo, startTree);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

for (const task of loadValueTasks(AGENT_VALUE_ROOT)) {
  test(`${task.id} fails its seed and passes its solution`, async () => {
    const seed = await scoreValueRoot(task, false);
    assert.equal(seed.harnessError, undefined);
    assert.equal(seed.pass, false, `seed passed: ${seed.detail}`);
    const solved = await scoreValueRoot(task, true);
    assert.equal(solved.harnessError, undefined);
    assert.equal(solved.pass, true, `solution failed: ${solved.detail}`);
  });
}
