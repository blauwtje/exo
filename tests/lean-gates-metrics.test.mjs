import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aggregate, gateFacts, incompleteReason, markdownTable, meanGap, metricDeltas, phasesOf, runMetrics } from '../benchmarks/lean-gates-metrics.mjs';

function referenceRun(out, name, meta) {
  const directory = join(out, name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'meta.json'), JSON.stringify(meta));
  return directory;
}

function measure(directory) {
  return runMetrics(directory, { recheck: false });
}

test('a good reference run is complete and carries its harness wall time', () => {
  const out = mkdtempSync(join(tmpdir(), 'lean-metrics-'));
  const run = measure(referenceRun(out, '01-new', { exitCode: 0, wallMs: 60000, version: 'new' }));
  assert.equal(run.incomplete, false);
  assert.equal(run.incompleteReason, null);
  assert.deepEqual(run.wall, { ms: 60000, source: 'meta' });
});

test('a bad reference run is incomplete and leaves the aggregate', () => {
  const out = mkdtempSync(join(tmpdir(), 'lean-metrics-'));
  const good = measure(referenceRun(out, '01-new', { exitCode: 0, wallMs: 60000, version: 'new' }));
  const bad = measure(referenceRun(out, '02-new', { exitCode: null, timedOut: true, wallMs: 900000, version: 'new' }));
  assert.equal(bad.incomplete, true);
  assert.equal(bad.incompleteReason, 'timed out');
  assert.deepEqual(aggregate([good, bad]).new.excluded.incomplete, ['02-new']);
  assert.equal(aggregate([good, bad]).new.wallMs.median, 60000);
});

test('incompleteReason names a timeout, a signal and an exit code', () => {
  assert.equal(incompleteReason({ exitCode: 0 }), null);
  assert.equal(incompleteReason({ timedOut: true, exitCode: 0 }), 'timed out');
  assert.equal(incompleteReason({ signal: 'SIGTERM', exitCode: null }), 'signal SIGTERM');
  assert.equal(incompleteReason({ exitCode: 3 }), 'exit 3');
  assert.equal(incompleteReason({}), 'no exit code');
});

test('metricDeltas prints the median change per version and metric against a baseline', () => {
  const stats = (median) => ({ runs: ['a'], excluded: {}, wallMs: { median }, findings: { median: null } });
  const lines = metricDeltas({ aggregate: { new: stats(45000) } }, { aggregate: { new: stats(60000), old: stats(1) } });
  assert.deepEqual(lines, ['new wallMs: 60000 -> 45000 (-15000)']);
});

const call = (id, name, input, ts, resultTs) => ({ id, name, input, ts, resultTs });

for (const skill of ['exo:verify', 'exo:gate', 'verify', 'gate']) {
  test(`gateFacts takes a Skill call to ${skill} as the verify call`, () => {
    const skillCall = call('s1', 'Skill', { skill }, '2026-01-01T00:01:00Z');
    const facts = gateFacts([call('b1', 'Bash', { command: 'ls' }, '2026-01-01T00:00:00Z'), skillCall]);
    assert.equal(facts.verifyRan, true);
    assert.equal(facts.verifyCall, skillCall);
  });
}

for (const script of ['verify.mjs', 'gate.mjs']) {
  test(`gateFacts takes a Bash call to node ${script} as the verify call`, () => {
    const bashCall = call('b1', 'Bash', { command: `node skills/x/scripts/${script} --plan p.md` }, '2026-01-01T00:01:00Z');
    const facts = gateFacts([bashCall]);
    assert.equal(facts.verifyRan, true);
    assert.equal(facts.verifyCall, bashCall);
  });
}

test('gateFacts ignores other skills and scripts', () => {
  const facts = gateFacts([call('s1', 'Skill', { skill: 'exo:gated' }, 't'), call('b1', 'Bash', { command: 'node skills/x/scripts/gated.mjs' }, 't')]);
  assert.equal(facts.verifyRan, false);
});

const phaseInput = (calls) => ({
  calls,
  subagents: [],
  meta: { startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:10:00Z' },
  facts: null,
  mainBounds: { first: '2026-01-01T00:00:00Z', last: '2026-01-01T00:10:00Z' }
});

for (const skill of ['exo:verify', 'exo:gate']) {
  test(`phasesOf starts the gate phase at a Skill call to ${skill}`, () => {
    const phases = phasesOf(phaseInput([call('s1', 'Skill', { skill }, '2026-01-01T00:04:00Z')]));
    assert.equal(phases.build.ms, 4 * 60000);
  });
}

for (const script of ['verify.mjs', 'gate.mjs']) {
  test(`phasesOf starts the gate phase at a Bash call to ${script} and counts it as a gate command`, () => {
    const phases = phasesOf(phaseInput([call('b1', 'Bash', { command: `node skills/x/scripts/${script}` }, '2026-01-01T00:04:00Z', '2026-01-01T00:05:00Z')]));
    assert.equal(phases.build.ms, 4 * 60000);
    assert.equal(phases.gate.commands, 1);
    assert.equal(phases.gate.busyMs, 60000);
    assert.equal(phases._verifyRuns.length, 1);
  });
}

test('an incomplete run counts as a failed completion and leaves wall time, with its excluded count in the table', () => {
  const out = mkdtempSync(join(tmpdir(), 'lean-metrics-'));
  const runs = [
    measure(referenceRun(out, '01-new', { exitCode: 0, wallMs: 60000, version: 'new' })),
    measure(referenceRun(out, '02-new', { exitCode: 0, wallMs: 80000, version: 'new' })),
    measure(referenceRun(out, '03-new', { exitCode: null, timedOut: true, wallMs: 900000, version: 'new' }))
  ];
  const { new: stats } = aggregate(runs);
  assert.equal(stats.completed.mean, 2 / 3);
  assert.equal(stats.wallMs.n, 2);
  assert.equal(stats.wallMs.mean, 70000);
  assert.equal(stats.wallMs.se, 10000);
  const table = markdownTable({ runs, aggregate: { new: stats } });
  assert.match(table, /\| new \| wallMs \(min\) \| 1\.2 \| 1\.0-1\.3 \| 1\.2 ± 0\.2 \| 2 \(excl\. 1\) \|/);
});

test('a single complete run prints no SE and never a default', () => {
  const out = mkdtempSync(join(tmpdir(), 'lean-metrics-'));
  const run = measure(referenceRun(out, '01-new', { exitCode: 0, wallMs: 60000, version: 'new' }));
  const stats = aggregate([run]).new;
  assert.equal(stats.wallMs.se, null);
  assert.equal(stats.costHarnessUsd.n, 0);
  assert.equal(stats.costHarnessUsd.mean, null);
  assert.match(markdownTable({ runs: [run], aggregate: { new: stats } }), /\| new \| wallMs \(min\) \| 1\.0 \| 1\.0-1\.0 \| 1\.0 no SE \| 1 \(excl\. 0\) \|/);
});

test('meanGap names a verdict only when the interval clears zero and says no SE under two runs', () => {
  const summary = (mean, se, n) => ({ mean, se, n });
  assert.equal(meanGap(summary(10, null, 1), summary(5, 1, 3)).verdict, 'no SE');
  assert.equal(meanGap(summary(10, 1, 3), summary(9, 1, 3)).verdict, 'crosses zero');
  assert.equal(meanGap(summary(10, 1, 3), summary(5, 1, 3)).verdict, 'below zero');
  assert.equal(meanGap(summary(5, 1, 3), summary(10, 1, 3)).verdict, 'above zero');
  assert.equal(meanGap({ mean: 10, sd: 2, n: 4 }, { mean: 4, sd: 2, n: 4 }).verdict, 'below zero');
});

test('metricDeltas appends the mean gap with its 95% CI to the median change', () => {
  const stats = (median, mean, se) => ({ runs: ['a', 'b', 'c'], excluded: {}, wallMs: { median, mean, se, n: 3 } });
  const [line] = metricDeltas({ aggregate: { new: stats(45000, 45000, 1000) } }, { aggregate: { new: stats(60000, 60000, 1000) } });
  assert.equal(line, 'new wallMs: 60000 -> 45000 (-15000); mean -15000 ±2770 (95% CI), below zero');
});
