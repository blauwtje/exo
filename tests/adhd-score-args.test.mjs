import assert from 'node:assert/strict';
import test from 'node:test';
import { ADHD_RUNS, SCORE_MAX_USD, parseArgs, readQuick } from '../benchmarks/adhd-score.mjs';
import { quickMaxUsd } from '../benchmarks/adhd/metrics.mjs';
import { quickPowerLine } from '../benchmarks/adhd/quick-report.mjs';
import { BREVITY_LINES } from '../benchmarks/tasks.mjs';

test('the full run defaults to 3 runs and a $3 cap', () => {
  const opts = parseArgs(['--full']);
  assert.equal(ADHD_RUNS, 3);
  assert.equal(opts.runs, 3);
  assert.equal(SCORE_MAX_USD, 3);
  assert.equal(opts.maxUsd, 3);
});

test('no flag selects the quick run with a cap of the case count times the per-case rate, --max-usd overrides it', () => {
  assert.equal(parseArgs([]).mode, 'quick');
  assert.equal(parseArgs([]).maxUsd, quickMaxUsd(readQuick()));
  assert.equal(parseArgs(['--cases', 'a,b']).maxUsd, 0.08);
  assert.equal(parseArgs(['--max-usd', '1']).maxUsd, 1);
  assert.equal(parseArgs(['--cases', 'a,b', '--model', 'm', '--judge-model', 'j', '--log-dir', 'd']).mode, 'quick');
});

test('each full-run flag selects the full run with today\'s defaults', () => {
  const flags = [['--full'], ['--screen'], ['--baseline'], ['--rescore', '--log', 'f'], ['--resume', 'p'], ['--runs', '3']];
  for (const argv of flags) {
    assert.equal(parseArgs(argv).mode, 'full', argv.join(' '));
    assert.ok(parseArgs(argv).maxUsd >= 3 || argv.includes('--baseline'), argv.join(' '));
  }
  for (const argv of [['--check'], ['--dry-run'], ['--to-label'], ['--calibrate'], ['--add-fail-labels'], ['--stability'], ['--concise-baseline']]) assert.equal(parseArgs(argv).mode, 'full', argv.join(' '));
  assert.equal(parseArgs(['--dry-run']).maxUsd, 3);
});

test('--arm takes adhd or caveman in the quick run only', () => {
  assert.equal(parseArgs([]).arm, 'adhd');
  assert.equal(parseArgs(['--arm', 'caveman']).arm, 'caveman');
  assert.throws(() => parseArgs(['--arm', 'nope']), /--arm needs one of: adhd, caveman/);
  assert.throws(() => parseArgs(['--arm', 'caveman', '--full']), /--arm cannot combine/);
  assert.throws(() => parseArgs(['--arm', 'caveman', '--runs', '1']), /--arm cannot combine/);
});


test('--all needs --baseline', () => {
  assert.equal(parseArgs(['--baseline', '--all']).all, true);
  assert.throws(() => parseArgs(['--all']), /--baseline/);
});

test('--ablate takes a brevity slug and defaults to null', () => {
  assert.equal(parseArgs([]).ablate, null);
  assert.equal(parseArgs(['--ablate', 'no-why']).ablate, 'no-why');
});

test('--ablate alone stays quick and with a full-run flag goes full', () => {
  assert.equal(parseArgs(['--ablate', 'no-why', '--cases', 'a']).mode, 'quick');
  assert.equal(parseArgs(['--ablate', 'no-why', '--runs', '2']).mode, 'full');
});

test('--ablate with an unknown slug lists the valid slugs', () => {
  assert.throws(() => parseArgs(['--ablate', 'nope']), (error) => Object.keys(BREVITY_LINES).every((slug) => error.message.includes(slug)));
});

test('--rescore needs --log and refuses --baseline and --dry-run', () => {
  assert.equal(parseArgs(['--rescore', '--log', 'f.json']).rescore, true);
  assert.equal(parseArgs([]).rescore, false);
  assert.throws(() => parseArgs(['--rescore']), /--rescore needs --log/);
  assert.throws(() => parseArgs(['--rescore', '--log', 'f', '--dry-run']), /cannot combine/);
  assert.throws(() => parseArgs(['--rescore', '--log', 'f', '--baseline']), /cannot combine/);
});

test('--resume takes a log file and refuses --baseline, --dry-run and --rescore', () => {
  assert.equal(parseArgs(['--resume', 'p.json']).resume, 'p.json');
  assert.equal(parseArgs([]).resume, null);
  assert.throws(() => parseArgs(['--resume', 'p', '--dry-run']), /cannot combine/);
  assert.throws(() => parseArgs(['--resume', 'p', '--baseline']), /cannot combine/);
  assert.throws(() => parseArgs(['--resume', 'p', '--rescore', '--log', 'f']), /cannot combine/);
});

test('--answers takes an integer of at least 1 and only in quick mode', () => {
  assert.equal(parseArgs([]).answers, 1);
  assert.equal(parseArgs(['--answers', '3']).answers, 3);
  assert.throws(() => parseArgs(['--answers', '0']), /--answers needs an integer of at least 1/);
  assert.throws(() => parseArgs(['--answers', '2', '--full']), /--answers cannot combine/);
});

test('--ablate with --arm caveman is refused', () => {
  assert.throws(() => parseArgs(['--ablate', 'one-sentence', '--arm', 'caveman']), /--ablate cannot combine with --arm caveman/);
  assert.equal(parseArgs(['--ablate', 'one-sentence', '--arm', 'adhd']).ablate, 'one-sentence');
});

test('the power line calls its minimum detectable effect a lower bound', () => {
  const perCase = Array.from({ length: 4 }, (_, at) => ({ id: `c${at}`, ratios: [0.2 + at * 0.1, 0.21 + at * 0.1] }));
  assert.match(quickPowerLine(perCase, 2), /lower bound/);
});

test('the default cost limit grows with --answers', () => {
  assert.ok(parseArgs(['--answers', '2']).maxUsd > parseArgs([]).maxUsd);
});
