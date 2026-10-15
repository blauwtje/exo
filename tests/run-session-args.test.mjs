import test from 'node:test';
import assert from 'node:assert/strict';
import { childEnv, claudeArgs, parseStream } from '../skills/build/scripts/run-session.mjs';

const base = { model: 'sonnet', effort: 'high', allow: ['Read'] };

test('claudeArgs passes model and effort when both are set', () => {
  const args = claudeArgs(base);
  assert.equal(args[args.indexOf('--model') + 1], 'sonnet');
  assert.equal(args[args.indexOf('--effort') + 1], 'high');
});

test('claudeArgs leaves out --model when model is null', () => {
  const args = claudeArgs({ ...base, model: null });
  assert.ok(!args.includes('--model'));
  assert.ok(args.includes('--effort'));
});

test('claudeArgs leaves out --effort when effort is null', () => {
  const args = claudeArgs({ ...base, effort: null });
  assert.ok(!args.includes('--effort'));
  assert.ok(args.includes('--model'));
});

test('claudeArgs keeps the other arguments when model and effort are both null', () => {
  const args = claudeArgs({ ...base, model: null, effort: null });
  assert.ok(!args.includes('--model'));
  assert.ok(!args.includes('--effort'));
  assert.ok(args.includes('--allowedTools'));
  assert.ok(args.includes('--strict-mcp-config'));
});

test('claudeArgs adds --resume with the session id when resume is set', () => {
  const args = claudeArgs({ ...base, resume: 'session-9' });
  assert.equal(args[args.indexOf('--resume') + 1], 'session-9');
});

test('claudeArgs leaves out --resume when resume is unset', () => {
  assert.ok(!claudeArgs(base).includes('--resume'));
});

test('claudeArgs passes --exclude-dynamic-system-prompt-sections for every session kind', () => {
  for (const kind of ['build', 'fix', 'review']) {
    assert.ok(claudeArgs({ ...base, kind }).includes('--exclude-dynamic-system-prompt-sections'));
  }
});

test('claudeArgs caps each session kind at its agent maxTurns', () => {
  const turns = (kind) => {
    const args = claudeArgs({ ...base, kind });
    return args[args.indexOf('--max-turns') + 1];
  };
  assert.equal(turns('build'), '60');
  assert.equal(turns('fix'), '40');
  assert.equal(turns('review'), '30');
});

test('claudeArgs multiplies the build cap by the task count of a plan session', () => {
  const args = claudeArgs({ ...base, kind: 'build', taskCount: 3 });
  assert.equal(args[args.indexOf('--max-turns') + 1], '180');
});

test('childEnv forces the 5-minute prompt cache for a claude 5m session and frees it for 1h', () => {
  const claude = { name: 'claude', effort: 'high', env: {} };
  assert.equal(childEnv(null, { ...claude, promptCacheTtl: '5m' }).FORCE_PROMPT_CACHING_5M, '1');
  const before = process.env.FORCE_PROMPT_CACHING_5M;
  process.env.FORCE_PROMPT_CACHING_5M = '1';
  try {
    assert.equal(childEnv(null, { ...claude, promptCacheTtl: '1h' }).FORCE_PROMPT_CACHING_5M, undefined);
    assert.equal(childEnv(null, { name: 'zai', effort: 'high', env: {}, promptCacheTtl: '5m' }).FORCE_PROMPT_CACHING_5M, '1');
  } finally {
    if (before === undefined) delete process.env.FORCE_PROMPT_CACHING_5M;
    else process.env.FORCE_PROMPT_CACHING_5M = before;
  }
});

const assistantLine = (id, usage) => JSON.stringify({ type: 'assistant', message: { id, usage, content: [] } });

test('parseStream sums cache reads and writes and reads the first write', () => {
  const text = [
    assistantLine('a', { input_tokens: 1, cache_read_input_tokens: 10, cache_creation_input_tokens: 500, output_tokens: 2 }),
    assistantLine('b', { input_tokens: 1, cache_read_input_tokens: 600, cache_creation_input_tokens: 40, output_tokens: 2 })
  ].join('\n');
  const parsed = parseStream(text);
  assert.equal(parsed.cacheRead, 610);
  assert.equal(parsed.cacheWrite, 540);
  assert.equal(parsed.firstCacheWrite, 500);
});

test('parseStream gives null cache figures when usage lacks them', () => {
  const parsed = parseStream(assistantLine('a', { input_tokens: 1, output_tokens: 2 }));
  assert.equal(parsed.cacheRead, null);
  assert.equal(parsed.cacheWrite, null);
  assert.equal(parsed.firstCacheWrite, null);
  assert.equal(parseStream('').cacheRead, null);
});

test('parseStream reads the subtype of the final result event', () => {
  const resultLine = (subtype) => JSON.stringify({ type: 'result', subtype, num_turns: 3, result: '' });
  assert.equal(parseStream(resultLine('error_max_turns')).subtype, 'error_max_turns');
  assert.equal(parseStream([resultLine('success'), resultLine('error_max_turns')].join('\n')).subtype, 'error_max_turns');
  assert.equal(parseStream('').subtype, null);
});
