import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, finalTextOf, judgePair, pairsOf, resultsMarkdown, summarize } from '../benchmarks/ideate-worker-score.mjs';

const BASE = 'sonnet:low';
const run = (label, number, fixture = 'q1') => ({ label, fixture, run: number, text: `${label} ${number}`, costUsd: label === BASE ? 0.1 : 0.2, seconds: 10 });
const interval = (mean, lo, hi) => ({ mean, lo, hi, se: 0.05, n: 4 });

test('finalTextOf takes the last result event', () => {
  const stdout = ['{"type":"result","result":"first"}', 'not json', '{"type":"result","result":"last"}'].join('\n');
  assert.equal(finalTextOf(stdout), 'last');
});

test('pairsOf faces variants to the same repeat and the base to its next repeat', () => {
  const runs = [run(BASE, 1), run(BASE, 2), run(BASE, 3), run('opus:low', 2)];
  const pairs = pairsOf({ runs, base: BASE });
  const variant = pairs.find((pair) => pair.label === 'opus:low');
  assert.equal(variant.opponent.run, 2);
  const self = pairs.filter((pair) => pair.label === BASE).map((pair) => [pair.run.run, pair.opponent.run]);
  assert.deepEqual(self, [[1, 2], [2, 3], [3, 1]]);
});

test('pairsOf makes no self pair from a single repeat', () => {
  assert.deepEqual(pairsOf({ runs: [run(BASE, 1)], base: BASE }), []);
});

test('judgePair runs both orders with anonymous labels and maps verdicts back', async () => {
  const prompts = [];
  const judge = async ({ prompt }) => {
    prompts.push(prompt);
    const variantFirst = prompt.includes('Answer A:\nopus:low');
    const dimension = prompt.includes('usefulness') ? 'usefulness' : 'specificity';
    return JSON.stringify({ [dimension]: variantFirst ? 'A' : 'tie' });
  };
  const pair = { run: run('opus:low', 1), opponent: run(BASE, 1) };
  const verdicts = await judgePair({ judge, pair, question: 'Q?' });
  assert.equal(prompts.length, 4);
  assert.deepEqual(verdicts.map((verdict) => verdict.value), [1, 0.5, 1, 0.5]);
});

test('decide needs the interval above one half, the margin over the noise floor and no worse ideas', () => {
  const base = { label: BASE, winRate: interval(0.5, 0.4, 0.6), distinct: interval(3, 2.5, 3.5), defaultRate: interval(0.3, 0.2, 0.4), costUsd: 0.1, cases: { distinct: { q1: 3, q2: 3 }, defaultRate: { q1: 0.3, q2: 0.3 } } };
  const strong = { label: 'opus:low', winRate: interval(0.7, 0.6, 0.8), distinct: interval(3.2, 2.8, 3.6), defaultRate: interval(0.25, 0.15, 0.35), costUsd: 0.3, cases: { distinct: { q1: 3.2, q2: 3.2 }, defaultRate: { q1: 0.25, q2: 0.35 } } };
  const cheaper = { ...strong, label: 'sonnet:medium', costUsd: 0.2 };
  const weak = { ...strong, winRate: interval(0.55, 0.45, 0.65) };
  const dull = { ...strong, cases: { ...strong.cases, distinct: { q1: 1, q2: 1.2 } } };
  assert.match(decide({ rows: [base, strong], base: BASE }), /opus:low beats sonnet:low/);
  assert.match(decide({ rows: [base, strong, cheaper], base: BASE }), /sonnet:medium beats .* cheaper of/);
  assert.match(decide({ rows: [base, weak], base: BASE }), /no variant beats/);
  assert.match(decide({ rows: [base, dull], base: BASE }), /no variant beats/);
});

test('resultsMarkdown prints the table, the dimension line and the decision', () => {
  const runs = [run(BASE, 1), run(BASE, 2), run('opus:low', 1), run('opus:low', 2, 'q2'), run(BASE, 1, 'q2')];
  const metricsByRun = new Map(runs.map((entry) => [entry, { distinct: 3, defaultRate: 0.2 }]));
  const verdicts = [{ dimension: 'usefulness', value: 1 }, { dimension: 'specificity', value: 0.5 }];
  const pairs = [{ label: 'opus:low', fixture: 'q1', verdicts }, { label: 'opus:low', fixture: 'q2', verdicts }, { label: BASE, fixture: 'q1', verdicts: [{ dimension: 'usefulness', value: 0.5 }] }];
  const rows = summarize({ runs, pairs, metricsByRun });
  const markdown = resultsMarkdown({ rows, base: BASE, tier: 'quick', judgeModel: 'judge-model', calibration: ['NO-LABELS x'] });
  assert.match(markdown, /\| opus:low \| 0\.75/);
  assert.match(markdown, /Per-dimension win rates: sonnet:low usefulness 0\.5.*opus:low usefulness 1/);
  assert.match(markdown, /Decision/);
});

test('decide uses the paired difference per fixture and fails closed without one', () => {
  const cases = (distinct, defaultRate) => ({ distinct, defaultRate });
  const base = { label: BASE, winRate: interval(0.5, 0.4, 0.6), costUsd: 0.1, cases: cases({ q1: 3, q2: 3, q3: 3 }, { q1: 0.3, q2: 0.3, q3: 0.3 }) };
  const good = { label: 'opus:low', winRate: interval(0.7, 0.6, 0.8), costUsd: 0.3, cases: cases({ q1: 3, q2: 3.1, q3: 2.9 }, { q1: 0.3, q2: 0.3, q3: 0.3 }) };
  const worse = { ...good, cases: cases({ q1: 1, q2: 1.1, q3: 0.9 }, good.cases.defaultRate) };
  const missing = { ...good, cases: undefined };
  assert.match(decide({ rows: [base, good], base: BASE }), /opus:low beats/);
  assert.match(decide({ rows: [base, worse], base: BASE }), /no variant beats/);
  assert.match(decide({ rows: [base, missing], base: BASE }), /no variant beats/);
});

test('dry run with no inputs prints an estimated price', async () => {
  const { spawnSync } = await import('node:child_process');
  const run = spawnSync('node', ['benchmarks/ideate-worker-score.mjs', '--dry-run'], { encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /estimated \$/);
});

test('kindJudge passes the kind effort and estimate prices the alias', async () => {
  const { estimate, kindJudge } = await import('../benchmarks/ideate-worker-score.mjs');
  assert.notEqual(estimate({ runs: [], pairs: [], fixtureCount: 1, judgeModel: 'haiku' }).usd, null);
  assert.equal(typeof kindJudge, 'function');
});

test('loadRuns leaves out budget-skipped sessions', async () => {
  const { loadRuns } = await import('../benchmarks/ideate-worker-score.mjs');
  const sessions = [{ agent: 'ideate-worker', model: 'sonnet', effort: 'low', fixture: 'q1', run: 1, skipped: true }];
  assert.deepEqual(loadRuns({ sessions, transcripts: '/nonexistent', tier: 'quick', fixtures: { quick: ['q1'], full: ['q1'] } }), []);
});

test('dry run plans the Decision 1 variants on one list the README commands repeat', async () => {
  const { spawnSync } = await import('node:child_process');
  const { readFileSync } = await import('node:fs');
  const { VARIANTS } = await import('../benchmarks/ideate-worker-score.mjs');
  assert.deepEqual(VARIANTS, ['sonnet:low', 'sonnet:medium', 'opus:low']);
  const run = spawnSync('node', ['benchmarks/ideate-worker-score.mjs', '--dry-run', '--tier', 'full'], { encoding: 'utf8' });
  assert.match(run.stdout, /3 arms/);
  const readme = readFileSync('benchmarks/README.md', 'utf8').split('\n').filter((line) => line.includes('agent-tier.mjs --agent ideate-worker'));
  assert.equal(readme.length, 2);
  for (const line of readme) {
    assert.match(line, /--transcripts/);
    for (const variant of VARIANTS) assert.ok(line.includes(`--candidate ${variant}`), `${variant} in ${line}`);
  }
});
