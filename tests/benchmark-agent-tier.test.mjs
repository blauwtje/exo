import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readKindTable } from '#model-kinds';
import { gradeRepair, loadFixtures } from '../benchmarks/review-replay.mjs';
import { loadValueTasks, prepareValueRepo, scoreValueRepo } from '../benchmarks/value.mjs';
import { confinedClaude } from '#confine-claude';
import { withHome } from '../skills/edit-skills/scripts/pressure.mjs';
import { Budget, apiKeySourceOf, candidatesFor, cellLine, dryRunText, estimateTotal, estimateUsd, estimateWallS, flaggedShare, modelUsageCost, offsetRuns, parseCandidate, planJobs, recordOf, recordedSessions, refusalText, resolveFixtures, runGated, sessionCost, settingOf, summarizeCells, usageOfStream, usesApiKey, valueScore, wilson95 } from '../benchmarks/agent-tier.mjs';

const AGENTS = ['locate-code', 'review-branch', 'fix-review', 'build-task', 'solve-hard', 'orchestrator', 'task-runner'];
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
  assert.deepEqual(settingOf('orchestrator', table), { model: 'opus', effort: 'xhigh' });
  assert.throws(() => settingOf('task-runner-x', table), /not in lib\/model-kinds.json/);
});

test('planJobs crosses candidates with the tier fixtures, and --candidate replaces the ladder', () => {
  const table = readKindTable();
  const ladder = planJobs({ config: CONFIG, agents: ['locate-code'], tier: 'full', candidates: null, table });
  assert.equal(ladder.length, 6);
  const chosen = planJobs({ config: CONFIG, agents: ['solve-hard'], tier: 'quick', candidates: [parseCandidate('haiku:low')], table });
  assert.deepEqual(chosen, [{ agent: 'solve-hard', candidate: { model: 'haiku', effort: 'low' }, fixture: 'c', run: 1 }]);
});

test('planJobs with runs repeats every fixture of every candidate once per run', () => {
  const jobs = planJobs({ config: CONFIG, agents: ['solve-hard'], tier: 'quick', candidates: [parseCandidate('haiku:low'), parseCandidate('sonnet:low')], table: readKindTable(), runs: 3 });
  assert.equal(jobs.length, 6);
  assert.deepEqual(jobs.map((job) => job.run), [1, 1, 2, 2, 3, 3]);
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

test('sessionCost prices every model in modelUsage, so subagent sessions count', () => {
  const modelUsage = {
    'claude-sonnet-5-5': { inputTokens: 1_000_000, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
    'claude-opus-5-5': { inputTokens: 0, outputTokens: 1_000_000, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 }
  };
  assert.equal(modelUsageCost(modelUsage), 2 + 20);
  assert.equal(modelUsageCost({ 'unknown-model': { inputTokens: 1 } }), null);
  assert.equal(modelUsageCost(undefined), null);
  const stream = JSON.stringify({ type: 'result', usage: { input_tokens: 1_000_000, output_tokens: 0 }, modelUsage });
  assert.equal(sessionCost({ stdout: stream }, 'sonnet'), 22);
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

test('summarizeCells gives each cell a mean check fraction and the min and max of its per-run means', () => {
  const sessions = [
    { agent: 'a', model: 'opus', effort: 'high', run: 1, score: 1, fraction: 1, cost_usd: 0.2, durationMs: 10_000 },
    { agent: 'a', model: 'opus', effort: 'high', run: 1, score: 0, fraction: 0.5, cost_usd: 0.2, durationMs: 10_000 },
    { agent: 'a', model: 'opus', effort: 'high', run: 2, score: 0, fraction: 0.75, cost_usd: 0.2, durationMs: 10_000 },
    { agent: 'a', model: 'opus', effort: 'high', run: 2, score: 0, fraction: 0.25, cost_usd: 0.2, durationMs: 10_000 }
  ];
  const [cell] = summarizeCells(sessions);
  assert.equal(cell.score, 0.25);
  assert.equal(cell.fraction, 0.625);
  assert.deepEqual(cell.spread, { score: { min: 0, max: 0.5 }, fraction: { min: 0.5, max: 0.75 } });
  assert.equal(cell.costPerSession, 0.2);
  assert.match(cellLine(cell, { a: { metric: 'm' } }), /^a opus:high m 25\.0% \(0\.0%-50\.0%\) checks 62\.5% \(50\.0%-75\.0%\) usd \$0\.80 \$0\.200\/session wall 10s median 10s wilson95 \[4\.6%-69\.9%\]$/);
});

test('summarizeCells takes the score as the fraction of a session that records none, and run 1 for one with no run', () => {
  const [cell] = summarizeCells([{ agent: 'a', model: 'haiku', effort: 'low', score: 0.4, cost_usd: 0, durationMs: 0 }]);
  assert.equal(cell.fraction, 0.4);
  assert.deepEqual(cell.spread.score, { min: 0.4, max: 0.4 });
});

test('valueScore fails a passing repo on a transcript finding and counts it in the fraction', () => {
  const scored = { pass: true, defects: 0, total: 4, detail: [] };
  assert.deepEqual(valueScore(scored, { findings: [], checks: 0 }), { score: 1, fraction: 1, detail: [] });
  assert.deepEqual(valueScore(scored, { findings: ['transcript: x'], checks: 2 }), { score: 0, fraction: 5 / 6, detail: ['transcript: x'] });
  assert.equal(valueScore({ pass: false, defects: 2, total: 4, detail: ['a', 'b'] }, { findings: [], checks: 0 }).fraction, 0.5);
});

test('recordOf keeps the run, the fraction and the detail, and falls back to the score as fraction', () => {
  const job = { agent: 'orchestrator', candidate: { model: 'sonnet', effort: 'medium' }, fixture: 'f', run: 2 };
  const outcome = { stdout: '', durationMs: 5, cost_usd: 0.1 };
  const record = recordOf(job, { outcome, score: 0, fraction: 0.5, detail: ['x'] });
  assert.equal(record.run, 2);
  assert.equal(record.fraction, 0.5);
  assert.deepEqual(record.detail, ['x']);
  assert.equal(recordOf(job, { outcome, score: 0.3 }).fraction, 0.3);
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

const INIT_LINE = (source) => JSON.stringify({ type: 'system', subtype: 'init', apiKeySource: source });
const SCRIPT = path.join(import.meta.dirname, '..', 'benchmarks', 'agent-tier.mjs');

test('wilson95 matches the Wilson score interval and stays inside 0 and 1', () => {
  assert.deepEqual(wilson95(0, 3), [0, 0.5615]);
  assert.deepEqual(wilson95(3, 3), [0.4385, 1]);
  assert.deepEqual(wilson95(5, 10), [0.2366, 0.7634]);
  assert.equal(wilson95(0, 0), null);
});

test('summarizeCells records wilson95 over passes of non-skipped sessions, counting an error as not passed, and the median wall', () => {
  const sessions = [
    { agent: 'a', model: 'opus', effort: 'high', score: 1, cost_usd: 0.1, durationMs: 10_000 },
    { agent: 'a', model: 'opus', effort: 'high', score: 1, cost_usd: 0.1, durationMs: 50_000 },
    { agent: 'a', model: 'opus', effort: 'high', score: 0.5, cost_usd: 0.1, durationMs: 20_000 },
    { agent: 'a', model: 'opus', effort: 'high', error: 'timeout', cost_usd: null, durationMs: 30_000 },
    { agent: 'a', model: 'opus', effort: 'high', skipped: true }
  ];
  const [cell] = summarizeCells(sessions);
  assert.deepEqual(cell.wilson95, wilson95(2, 4));
  assert.equal(cell.wallMedianS, 25);
  assert.match(cellLine(cell, { a: { metric: 'm' } }), /\$0\.075\/session .* median 25s wilson95 \[15\.0%-85\.0%\]$/);
});

test('apiKeySourceOf reads the init line of a stream and is null when there is none', () => {
  const stream = `${JSON.stringify({ type: 'assistant' })}\n${INIT_LINE('ANTHROPIC_API_KEY')}\n${JSON.stringify({ type: 'result' })}`;
  assert.equal(apiKeySourceOf(stream), 'ANTHROPIC_API_KEY');
  assert.equal(apiKeySourceOf(INIT_LINE('none')), 'none');
  assert.equal(apiKeySourceOf('not json\n'), null);
  assert.equal(apiKeySourceOf(undefined), null);
});

test('recordOf records the apiKeySource of every session, error or not', () => {
  const job = { agent: 'orchestrator', candidate: { model: 'sonnet', effort: 'medium' }, fixture: 'f', run: 1 };
  assert.equal(recordOf(job, { outcome: { stdout: INIT_LINE('ANTHROPIC_API_KEY'), durationMs: 5 }, score: 1 }).apiKeySource, 'ANTHROPIC_API_KEY');
  assert.equal(recordOf(job, { outcome: { stdout: INIT_LINE('none'), durationMs: 5, error: 'x' } }).apiKeySource, 'none');
  assert.equal(recordOf(job, { outcome: { stdout: '', durationMs: 5 }, score: 1 }).apiKeySource, null);
});

test('runGated starts no other task when the first session did not use the api key, and names the value found', async () => {
  const started = [];
  const task = (name, apiKeySource) => async () => { started.push(name); return { name, apiKeySource }; };
  const refusedRun = await runGated([task('a', 'none'), task('b', 'ANTHROPIC_API_KEY')], 2, usesApiKey);
  assert.deepEqual(started, ['a']);
  assert.equal(refusedRun.refused.name, 'a');
  assert.match(refusalText(refusedRun.refused), /apiKeySource none, not ANTHROPIC_API_KEY/);
  assert.match(refusalText({ apiKeySource: null }), /none \(no init line\)/);
  const okRun = await runGated([task('c', 'ANTHROPIC_API_KEY'), task('d', 'ANTHROPIC_API_KEY'), task('e', 'ANTHROPIC_API_KEY')], 2, usesApiKey);
  assert.equal(okRun.refused, null);
  assert.deepEqual(okRun.sessions.map((session) => session.name), ['c', 'd', 'e']);
  assert.equal(usesApiKey({ skipped: true }), true);
});

test('the session environment keeps ANTHROPIC_API_KEY from the caller and the isolated HOME', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tier-env-'));
  try {
    const run = withHome(confinedClaude({ args: ['-p', 'x'], roots: [folder], tmp: folder, platform: 'linux' }), '/isolated-home');
    const env = { ...{ ANTHROPIC_API_KEY: 'sk-test', HOME: '/real' }, ...run.env };
    assert.equal(env.ANTHROPIC_API_KEY, 'sk-test');
    assert.equal(env.HOME, '/isolated-home');
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test('offsetRuns numbers a merged round after the last recorded run of the same setting', () => {
  const existing = [
    { agent: 'orchestrator', model: 'opus', effort: 'xhigh', run: 3 },
    { agent: 'orchestrator', model: 'opus', effort: 'xhigh', run: 2 },
    { agent: 'orchestrator', model: 'sonnet', effort: 'high' }
  ];
  const jobs = [
    { agent: 'orchestrator', candidate: { model: 'opus', effort: 'xhigh' }, fixture: 'f', run: 1 },
    { agent: 'orchestrator', candidate: { model: 'opus', effort: 'xhigh' }, fixture: 'f', run: 2 },
    { agent: 'orchestrator', candidate: { model: 'sonnet', effort: 'high' }, fixture: 'f', run: 1 },
    { agent: 'orchestrator', candidate: { model: 'sonnet', effort: 'low' }, fixture: 'f', run: 1 }
  ];
  assert.deepEqual(offsetRuns(jobs, existing).map((job) => job.run), [4, 5, 2, 1]);
});

test('merged sessions recompute a cell from the old and new runs together', () => {
  const old = [1, 2, 3].map((run) => ({ agent: 'a', model: 'opus', effort: 'high', run, score: run === 1 ? 0 : 1, cost_usd: 0.1, durationMs: 1000 }));
  const added = [4, 5].map((run) => ({ agent: 'a', model: 'opus', effort: 'high', run, score: 1, cost_usd: 0.1, durationMs: 1000 }));
  const [cell] = summarizeCells([...old, ...added]);
  assert.equal(cell.sessions, 5);
  assert.deepEqual(cell.wilson95, wilson95(4, 5));
});

test('estimateUsd uses the fixture median, else the mean of per-fixture medians, so a heavy fixture is not hidden', () => {
  const candidate = { model: 'opus', effort: 'xhigh' };
  const recorded = [
    { agent: 'locate-code', ...candidate, fixture: 'heavy', cost_usd: 0.5, durationMs: 100_000 },
    { agent: 'locate-code', ...candidate, fixture: 'light', cost_usd: 0.1, durationMs: 20_000 },
    { agent: 'locate-code', ...candidate, fixture: 'light', cost_usd: 0.1, durationMs: 40_000 },
    { agent: 'locate-code', ...candidate, fixture: 'light2', cost_usd: 0.1, durationMs: 30_000 }
  ];
  assert.equal(estimateUsd('locate-code', candidate, recorded, CONFIG, 'heavy'), 0.5);
  assert.equal(estimateUsd('locate-code', candidate, recorded, CONFIG, 'light'), 0.1);
  assert.ok(Math.abs(estimateUsd('locate-code', candidate, recorded, CONFIG, 'other') - 0.7 / 3) < 1e-9);
  assert.equal(estimateWallS('locate-code', candidate, recorded, CONFIG, 'light'), 30);
  assert.equal(estimateWallS('locate-code', candidate, [], CONFIG, 'light'), null);
});

test('a profile scales its priced counts and its wall by model:effort and prices cache writes', () => {
  const config = { x: { metric: 'm', fixtures: { quick: ['a'], full: ['a'] }, profile: { cache5m: 1_000_000, wallS: 10, usdScale: { 'sonnet:high': 3 }, wallScale: { 'sonnet:high': 2 } } } };
  const base = estimateUsd('x', { model: 'sonnet', effort: 'medium' }, [], config);
  assert.ok(base > 0);
  assert.ok(Math.abs(estimateUsd('x', { model: 'sonnet', effort: 'high' }, [], config) - 3 * base) < 1e-9);
  assert.equal(estimateWallS('x', { model: 'sonnet', effort: 'high' }, [], config), 20);
  assert.equal(estimateWallS('x', { model: 'sonnet', effort: 'medium' }, [], config), 10);
});

test('dryRunText prints the estimated wall as the summed session walls over the concurrency', () => {
  const config = { x: { metric: 'm', fixtures: { quick: ['a'], full: ['a'] }, profile: { output: 1_000_000, wallS: 60 } } };
  const jobs = Array.from({ length: 4 }, () => ({ agent: 'x', candidate: { model: 'sonnet', effort: 'medium' }, fixture: 'a' }));
  assert.match(dryRunText(jobs, [], config, 2), /^total: 4 sessions, est \$\d+\.\d\d, est wall 2\.0 min at concurrency 2$/m);
  assert.match(dryRunText(jobs, [], { x: { ...config.x, profile: { output: 1 } } }, 2), /est wall n\/a/);
});

test('recordedSessions reads the earlier agent key orchestrate as orchestrator', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tier-history-'));
  try {
    const file = path.join(folder, 'old.json');
    fs.writeFileSync(file, JSON.stringify({ sessions: [{ agent: 'orchestrate', model: 'opus', effort: 'low', fixture: 'f', cost_usd: 0.1 }, { agent: 'solve-hard', model: 'opus', effort: 'low' }] }));
    assert.deepEqual(recordedSessions(file).map((session) => session.agent), ['orchestrator', 'solve-hard']);
    assert.deepEqual(recordedSessions(path.join(folder, 'missing.json')), []);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test('--dry-run with --history prices a candidate from the recorded old sessions and the shipped profile otherwise', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tier-dry-'));
  try {
    const file = path.join(folder, 'old.json');
    const sessions = ['false-pass', 'false-check', 'false-fact', 'false-change', 'five-parts', 'open-choice'].map((fixture) => ({ agent: 'orchestrate', model: 'opus', effort: 'xhigh', fixture, cost_usd: 1, durationMs: 60_000 }));
    fs.writeFileSync(file, JSON.stringify({ sessions }));
    const args = [SCRIPT, '--agent', 'orchestrator', '--tier', 'full', '--candidate', 'opus:xhigh', '--dry-run', '--out', path.join(folder, 'none.json')];
    const withHistory = spawnSync('node', [...args, '--history', file], { encoding: 'utf8' });
    assert.equal(withHistory.status, 0, withHistory.stderr);
    assert.match(withHistory.stdout, /^total: 6 sessions, est \$6\.00, est wall 3\.0 min at concurrency 2$/m);
    const profileOnly = spawnSync('node', args, { encoding: 'utf8' });
    assert.match(profileOnly.stdout, /^total: 6 sessions, est \$\d\.\d\d, est wall \d/m);
    assert.doesNotMatch(profileOnly.stdout, /est \$6\.00/);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test('--require-api-key stops with a usage error before any session when ANTHROPIC_API_KEY is unset', () => {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  const run = spawnSync('node', [SCRIPT, '--agent', 'orchestrator', '--candidate', 'sonnet:low', '--require-api-key', '--out', path.join(os.tmpdir(), 'tier-never.json')], { encoding: 'utf8', env });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /needs ANTHROPIC_API_KEY set/);
});

test('the shipped orchestrator profile predicts each recorded round-1 setting within 15 percent', () => {
  const config = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'benchmarks', 'agent-tier', 'agents.json'), 'utf8'));
  const results = ['full', 'quick'].flatMap((tier) => recordedSessions(path.join(import.meta.dirname, '..', 'benchmarks', 'results', `agent-tier-orchestrate-${tier}.json`)));
  const settings = new Set(results.map((session) => `${session.model}:${session.effort}`));
  assert.equal(settings.size, 8);
  for (const setting of settings) {
    const [model, effort] = setting.split(':');
    const own = results.filter((session) => session.model === model && session.effort === effort);
    const meanUsd = own.reduce((total, session) => total + session.cost_usd, 0) / own.length;
    const meanWall = own.reduce((total, session) => total + session.durationMs / 1000, 0) / own.length;
    const usd = estimateUsd('orchestrator', { model, effort }, [], config);
    const wall = estimateWallS('orchestrator', { model, effort }, [], config);
    assert.ok(Math.abs(usd / meanUsd - 1) < 0.15, `${setting} usd ${usd} vs ${meanUsd}`);
    assert.ok(Math.abs(wall / meanWall - 1) < 0.15, `${setting} wall ${wall} vs ${meanWall}`);
  }
});
