import assert from 'node:assert/strict';
import test from 'node:test';
import { compareToBaseline, comparisonSection, parseResultRuns, splitFlowRuns } from '../lib/benchmark-compare.mjs';

const passDetail = '4/4 Plan-task trailers, hidden check pass';
const run = (cost, wall, detail = passDetail) => ({
  row: 1, cell: 'flow', tokens: 100, wall, cost, detail, passed: detail.includes('hidden check pass'),
});

const table = [
  '| Cell | Model | Effort | Defects found | False alarms | Tokens | Wall time | Cost | Detail |',
  '|---|---|---|---|---|---|---|---|---|',
  '| flow | m | high | - | - | 100 | 52s | $0.194 | 0/4 Plan-task trailers, hidden check pass |',
  '| flow | m | high | - | - | 200 | 107s | $0.485 | 4/4 Plan-task trailers, hidden check pass |',
].join('\n');

test('parses rows and splits bypassing runs', () => {
  const runs = parseResultRuns(table);
  assert.equal(runs.length, 2);
  assert.equal(runs[1].wall, 107);
  const { kept, bypassed } = splitFlowRuns(runs);
  assert.equal(kept.length, 1);
  assert.equal(bypassed[0].row, 1);
});

test('a rise under minRise with zero spread does not block', () => {
  const baseline = [run(1, 100), run(1, 100)];
  const candidate = [run(1.05, 100), run(1.05, 100)];
  assert.equal(compareToBaseline({ baseline, candidate, minRise: 0.1 }).blocked, false);
});

test('a rise past minRise with zero spread blocks', () => {
  const baseline = [run(1, 100), run(1, 100)];
  const candidate = [run(1.2, 100), run(1.2, 100)];
  assert.equal(compareToBaseline({ baseline, candidate, minRise: 0.1 }).blocked, true);
});

test('a rise within the noise bound does not block', () => {
  const baseline = [run(0.2, 100), run(0.6, 100), run(0.4, 100)];
  const candidate = [run(0.3, 100), run(0.7, 100), run(0.5, 100)];
  assert.equal(compareToBaseline({ baseline, candidate, minRise: 0.1 }).blocked, false);
});

const withPeak = (coordinator) => ({ ...run(1, 100), hopPeakTokens: { main: 1000, coordinator, workers: 500 } });

test('a rise in one hop peak blocks and a flat peak does not', () => {
  const baseline = [withPeak(2000), withPeak(2000)];
  const risen = compareToBaseline({ baseline, candidate: [withPeak(3000), withPeak(3000)], minRise: 0.1 });
  assert.equal(risen.blocked, true);
  const verdicts = risen.cells[0].metrics.filter((entry) => entry.verdict === 'regression');
  assert.deepEqual(verdicts.map((entry) => entry.metric), ['peak coordinator']);
  assert.equal(compareToBaseline({ baseline, candidate: [withPeak(2000), withPeak(2000)], minRise: 0.1 }).blocked, false);
});

test('a pass-rate drop blocks and fewer than 2 flow runs is unmeasured', () => {
  const failing = run(1, 100, '4/4 Plan-task trailers, hidden check fail');
  const drop = compareToBaseline({ baseline: [run(1, 100), run(1, 100)], candidate: [failing, run(1, 100)], minRise: 0.1 });
  assert.equal(drop.blocked, true);
  const bypass = run(1, 100, '0/4 Plan-task trailers, hidden check pass');
  const few = compareToBaseline({ baseline: [run(1, 100), run(1, 100)], candidate: [bypass, run(1, 100)], minRise: 0.1 });
  assert.equal(few.cells[0].status, 'unmeasured');
  assert.match(comparisonSection({ result: few }).join('\n'), /Excluded: candidate row 1/);
});

test('benchmarkMinRise honours a user default and survives a malformed run.json', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { benchmarkMinRise } = await import('../lib/benchmark-compare.mjs');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rise-'));
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  const file = path.join(home, '.config', 'exo', 'run.json');
  fs.writeFileSync(file, '{"defaults":{"benchmarkMinRise":0.3}}');
  assert.equal(benchmarkMinRise(home), 0.3);
  fs.writeFileSync(file, '{bad');
  assert.equal(benchmarkMinRise(home), 0.1);
});
