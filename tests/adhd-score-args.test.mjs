import assert from 'node:assert/strict';
import test from 'node:test';
import { ADHD_RUNS, SCORE_MAX_USD, parseArgs } from '../benchmarks/adhd-score.mjs';
import { BREVITY_LINES } from '../benchmarks/tasks.mjs';

test('the full run defaults to 3 runs and a $3 cap', () => {
  const opts = parseArgs(['--full']);
  assert.equal(ADHD_RUNS, 3);
  assert.equal(opts.runs, 3);
  assert.equal(SCORE_MAX_USD, 3);
  assert.equal(opts.maxUsd, 3);
});

test('no flag selects the quick run with a $0.30 cap, --max-usd overrides it', () => {
  assert.equal(parseArgs([]).mode, 'quick');
  assert.equal(parseArgs([]).maxUsd, 0.3);
  assert.equal(parseArgs(['--max-usd', '1']).maxUsd, 1);
  assert.equal(parseArgs(['--cases', 'a,b', '--model', 'm', '--judge-model', 'j', '--log-dir', 'd']).mode, 'quick');
});

test('each full-run flag selects the full run with today\'s defaults', () => {
  const flags = [['--full'], ['--screen'], ['--baseline'], ['--rescore', '--log', 'f'], ['--resume', 'p'], ['--ablate', 'no-why'], ['--runs', '3']];
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
