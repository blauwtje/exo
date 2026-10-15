import test from 'node:test';
import assert from 'node:assert/strict';
import { childEnv, claudeArgs } from '../skills/build/scripts/run-session.mjs';

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
