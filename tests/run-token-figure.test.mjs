import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStream } from '../skills/build/scripts/run-session.mjs';
import { landedLine } from '../skills/build/scripts/run-report.mjs';

const call = (id, read) => JSON.stringify({
  type: 'assistant',
  message: { id, content: [], usage: { input_tokens: 10, cache_read_input_tokens: read, cache_creation_input_tokens: 1000, output_tokens: 40 } }
});
const result = JSON.stringify({
  type: 'result',
  subtype: 'success',
  num_turns: 2,
  total_cost_usd: 1,
  usage: { input_tokens: 20, cache_read_input_tokens: 200000, cache_creation_input_tokens: 2000, output_tokens: 500 }
});
const stream = [call('m1', 100000), call('m2', 100000), result].join('\n');

test('the session figure weights cache reads and takes output from the result usage', () => {
  const parsed = parseStream(stream);
  // 20 input + 200000 * 0.1 cache read + 2000 * 1.25 cache write + 500 result output
  assert.equal(parsed.weightedTokens, 23020);
  assert.equal(parsed.cacheRead, 200000);
  assert.equal(parsed.cacheWrite, 2000);
  assert.match(landedLine({ number: 1, sha: 'abcdef1234', ms: 1000, turns: 2, weightedTokens: parsed.weightedTokens, cost: 1 }), /· 23k weighted tokens ·/);
});
