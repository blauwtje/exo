import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseStream } from '../skills/edit-skills/scripts/pressure.mjs';

const usage = ({ input, output, read, created }) => ({
  inputTokens: input,
  outputTokens: output,
  cacheReadInputTokens: read,
  cacheCreationInputTokens: created,
  costUSD: 0.001
});

const subagentEvent = {
  type: 'assistant',
  parent_tool_use_id: 'toolu_agent',
  message: { content: [{ type: 'text', text: 'sub' }], usage: { input_tokens: 2, output_tokens: 3, cache_creation_input_tokens: 9060 } }
};
const init = { type: 'system', subtype: 'init' };
const firstResult = {
  type: 'result',
  result: 'first',
  total_cost_usd: 0.00327,
  usage: { input_tokens: 6, output_tokens: 519, cache_creation_input_tokens: 8081, cache_read_input_tokens: 25489 },
  modelUsage: { haiku: usage({ input: 6, output: 519, read: 25489, created: 17141 }) }
};
const lastResult = {
  type: 'result',
  result: 'last',
  total_cost_usd: 0.00361,
  usage: { input_tokens: 2, output_tokens: 97, cache_creation_input_tokens: 647, cache_read_input_tokens: 17203 },
  modelUsage: { haiku: usage({ input: 8, output: 616, read: 42692, created: 17788 }), sonnet: usage({ input: 1, output: 4, read: 5, created: 6 }) }
};

const stream = (...events) => events.map((event) => JSON.stringify(event)).join('\n');
const sum = (models, keys) => Object.values(models).reduce((total, model) => total + keys.reduce((inner, key) => inner + model[key], 0), 0);

test('tokens come from the last result modelUsage over every model, subagents included', () => {
  const { tokens, cost, finalText } = parseStream(stream(init, subagentEvent, firstResult, init, lastResult));
  assert.deepEqual(tokens, {
    input: sum(lastResult.modelUsage, ['inputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens']),
    output: sum(lastResult.modelUsage, ['outputTokens'])
  });
  assert.equal(cost, lastResult.total_cost_usd);
  assert.equal(finalText, 'last');
});

test('a stream whose results hold no modelUsage logs no tokens', () => {
  const bare = (result) => ({ ...result, modelUsage: undefined });
  const { tokens } = parseStream(stream(init, bare(firstResult), init, bare(lastResult)));
  assert.equal(tokens, undefined);
});
