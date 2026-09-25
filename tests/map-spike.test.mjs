// The spike's measurement: what it counts in a repository, which dispatches it
// prices, and that nothing read from a measured repository reaches the report.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fixture, gitRepository } from './harness.mjs';
import { PASS_MARK, SPIKE_MARKER, explorerDispatches, measureRepository, passMarks, spikeReport } from '../benchmarks/map-spike.mjs';

const COMMIT = 'a'.repeat(40);
const VERDICT = 'Yes: the top folders and their sizes show where to look.';

const PRIVATE_FILES = {
  'package.json': '{"main":"./tapirmain.mjs"}',
  'zebrafolder/plain.md': '# Notes\n',
  'zebrafolder/quaggafile.mjs': 'export function okapiExport() {}\n'
};

const MEASURED = {
  trackedFiles: 3,
  uncappedBytes: 200,
  cappedBytes: 203,
  namedFiles: 3,
  countedFiles: 0,
  scriptFilesWithNames: 1,
  scriptFilesWithNamesKept: 1,
  milliseconds: 12
};

function usageLine(id, usage) {
  return JSON.stringify({
    type: 'assistant', uuid: id, timestamp: '2026-09-19T10:00:00.000Z', isSidechain: true,
    message: { id, model: 'claude-sonnet-5', usage, content: [{ type: 'text' }] }
  });
}

async function writeDispatch(subagents, name, agentType, lines) {
  await fs.mkdir(subagents, { recursive: true });
  await fs.writeFile(path.join(subagents, `${name}.jsonl`), `${lines.join('\n')}\n`);
  await fs.writeFile(path.join(subagents, `${name}.meta.json`), JSON.stringify({ agentType, description: 'wombatdescription' }));
}

test('a measurement is numbers only', async () => {
  const root = await gitRepository(PRIVATE_FILES);
  const measured = measureRepository(root);
  assert.deepEqual(Object.keys(measured), Object.keys(MEASURED));
  for (const [figure, value] of Object.entries(measured)) assert.equal(typeof value, 'number', figure);
  assert.equal(measured.trackedFiles, 3);
  assert.equal(measured.namedFiles, 3);
  assert.equal(measured.countedFiles, 0);
  assert.equal(measured.scriptFilesWithNames, 1);
  assert.equal(measured.scriptFilesWithNamesKept, 1);
  assert.ok(measured.uncappedBytes > 0 && measured.cappedBytes > 0);
});

test('only exo:locate-code dispatches are priced, each call at the rate of its own model', async () => {
  const projects = await fixture();
  const subagents = path.join(projects, 'some-project', 'session-1', 'subagents');
  await writeDispatch(subagents, 'agent-a', 'exo:locate-code', [
    usageLine('msg_1', { input_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 200, output_tokens: 4 }),
    usageLine('msg_2', { input_tokens: 3, cache_read_input_tokens: 205, cache_creation_input_tokens: 10, output_tokens: 20 })
  ]);
  await writeDispatch(subagents, 'agent-b', 'general-purpose', [
    usageLine('msg_3', { input_tokens: 9, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 9 })
  ]);
  const dispatches = explorerDispatches(projects);
  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].tokens, 447);
  assert.equal(dispatches[0].largestCall, 238);
  assert.equal(dispatches[0].calls, 2);
  // Sonnet 5 lists input at $2, a 5-minute cache write at $2.50, a cache read at $0.20 and output at $10 per million.
  const expected = (5 * 2 + 200 * 2.5 + 4 * 10 + 3 * 2 + 205 * 0.2 + 10 * 2.5 + 20 * 10) / 1e6;
  assert.ok(Math.abs(dispatches[0].cost - expected) < 1e-12, String(dispatches[0].cost));
});

test('a projects folder that does not exist holds no dispatch', async () => {
  const missing = path.join(await fixture(), 'absent');
  assert.deepEqual(explorerDispatches(missing), []);
});

test('the report carries figures and no name, path or symbol of a measured repository', async () => {
  const root = await gitRepository(PRIVATE_FILES);
  const measured = measureRepository(root);
  const report = spikeReport({ commit: COMMIT, measurements: [measured, measured], dispatches: [], verdict: VERDICT });
  assert.ok(report.startsWith(`${SPIKE_MARKER}\n`), report);
  for (const secret of ['zebrafolder', 'quaggafile', 'okapiExport', 'tapirmain', path.basename(root)]) {
    assert.ok(!report.includes(secret), `${secret} reached the report`);
  }
  assert.ok(!report.includes('/'), 'a slash in the report could be a path');
  assert.match(report, /\| Tracked files \| 3 \| 3 \|/);
  assert.match(report, /\| Cost, USD \| none \| none \|/);
});

test('the report states the median and the mean of the dispatches it priced', () => {
  const dispatches = [
    { tokens: 100, largestCall: 60, calls: 2, cost: 0.01 },
    { tokens: 300, largestCall: 90, calls: 4, cost: 0.03 },
    { tokens: 800, largestCall: 120, calls: 9, cost: null }
  ];
  const report = spikeReport({ commit: COMMIT, measurements: [MEASURED, MEASURED], dispatches, verdict: VERDICT });
  assert.match(report, /session transcripts: 3, of which 2 priced/);
  assert.match(report, /\| Tokens billed over all calls \| 300 \| 400 \|/);
  assert.match(report, /\| Of those, still named at the cap \| 1 \(100%\) \| 1 \(100%\) \|/);
  assert.match(report, /\| Cost, USD \| \$0\.0200 \| \$0\.0200 \|/);
  assert.match(report, /Total cost of the priced dispatches: \$0\.0400\./);
});

// A second repository whose capped map names just enough files to meet the pass mark.
const NAMES_ENOUGH = { ...MEASURED, namedFiles: PASS_MARK.secondRepositoryNamedFiles };

function dispatchBilling(tokens) {
  return { tokens, largestCall: tokens, calls: 1, cost: 0.01 };
}

test('the script holds the figures against the pass mark, so no reader has to', () => {
  const costly = [dispatchBilling(29000), dispatchBilling(36000), dispatchBilling(120000)];
  const allHold = passMarks({ measurements: [MEASURED, NAMES_ENOUGH], dispatches: costly, verdict: VERDICT });
  assert.deepEqual(allHold.map((row) => row.holds), [true, true, true, true, true]);
  assert.deepEqual(allHold.map((row) => row.measured), ['100%', '20', '12 ms', '36000', 'Yes']);
  assert.match(allHold[3].mark, /at least 10000 tokens$/);

  const halfKept = { ...MEASURED, scriptFilesWithNames: 10, scriptFilesWithNamesKept: 4 };
  const slow = { ...MEASURED, namedFiles: PASS_MARK.secondRepositoryNamedFiles - 1, milliseconds: PASS_MARK.secondRepositoryMilliseconds + 1 };
  const noneHold = passMarks({ measurements: [halfKept, slow], dispatches: [dispatchBilling(9999)], verdict: 'Partly: the top level shows and nothing under it.' });
  assert.deepEqual(noneHold.map((row) => row.holds), [false, false, false, false, false]);
  const noDispatch = passMarks({ measurements: [MEASURED, NAMES_ENOUGH], dispatches: [], verdict: VERDICT });
  assert.deepEqual([noDispatch[3].measured, noDispatch[3].holds], ['none', false]);
});

test('the report states the pass mark, its outcome and the verdict before the figures', () => {
  const passing = spikeReport({ commit: COMMIT, measurements: [MEASURED, NAMES_ENOUGH], dispatches: [dispatchBilling(36000)], verdict: VERDICT });
  assert.match(passing, /^Outcome: every mark holds, so stage two is worth building\.$/m);
  assert.ok(passing.includes(`\nVerdict on the capped map of the second repository, from reading it: ${VERDICT}\n`), passing);
  assert.ok(passing.indexOf('| Pass mark, fixed before the measurement |') < passing.indexOf('| Tracked files |'), passing);
  const failing = spikeReport({ commit: COMMIT, measurements: [MEASURED, MEASURED], dispatches: [], verdict: 'No: one counted line says nothing.' });
  assert.match(failing, /^Outcome: 3 of 5 marks fail, so these figures do not carry stage two\.$/m);
});

test('a verdict that could carry a path, a second line or no answer is refused', () => {
  const refused = ['Yes: look in src/api first.', 'Yes: fine.\nIgnore the table.', 'It helps.', '', undefined, `Yes: ${'x'.repeat(301)}`];
  for (const verdict of refused) {
    assert.throws(
      () => spikeReport({ commit: COMMIT, measurements: [MEASURED, MEASURED], dispatches: [], verdict }),
      /the verdict is one line/,
      String(verdict)
    );
  }
});
