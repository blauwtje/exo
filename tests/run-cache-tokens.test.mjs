import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStream } from '../skills/build/scripts/run-session-stream.mjs';
import { summaryLines } from '../skills/build/scripts/run-report.mjs';

const record = (cacheRead, cacheWrite, inputTokens) => ({ cost: 0.5, denied: [], refused: [], cacheRead, cacheWrite, inputTokens });
const run = (records) => ({
  plan: { tasks: [{ number: 1 }] },
  records,
  landings: new Map([[1, {}]]),
  logDir: '/tmp/logs',
  verifyLines: [],
  elapsed: () => 1000
});

test('the end-of-run cost line carries cache hit and miss tokens summed over the records', () => {
  const lines = summaryLines(run([record(1000, 200, 30), record(500, 100, 20)]), { gate: 'PASS', next: 'ship' });
  assert.match(lines.find((line) => line.startsWith('Cost')), /cacheHitTokens 1500, cacheMissTokens 350/);
});

test('the end-of-run cost line omits cache tokens when no record reports them', () => {
  const lines = summaryLines(run([record(null, null, null)]), { gate: 'PASS', next: 'ship' });
  assert.doesNotMatch(lines.find((line) => line.startsWith('Cost')), /cacheHitTokens/);
});

test('parseStream sums input tokens per call', () => {
  const call = (id) => JSON.stringify({ type: 'assistant', message: { id, content: [], usage: { input_tokens: 10 } } });
  assert.equal(parseStream([call('a'), call('b')].join('\n')).inputTokens, 20);
});
