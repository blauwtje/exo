import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { RUN_OUTCOMES } from '../lib/run-outcomes.mjs';
import { REFUSAL_HANDLERS, isRetryable, refusalHandler } from '../lib/refusal-handlers.mjs';

const KINDS = ['plan drift', 'input unreachable', 'outside Files', 'report missing', 'proof failed', 'env', 'code rule', 'start stop', 'refused', 'landed', 'pin', 'lock', 'unfinished merge'];

test('every refusal kind maps to one single-line Then: handler', () => {
  assert.deepEqual(Object.keys(REFUSAL_HANDLERS).sort(), [...KINDS].sort());
  assert.ok(Object.keys(REFUSAL_HANDLERS).every((kind) => RUN_OUTCOMES[kind] !== undefined));
  for (const kind of KINDS) {
    const line = refusalHandler(kind);
    assert.match(line, /^Then: \S/, kind);
    assert.ok(!line.includes('\n'), kind);
  }
});

test('an unknown refusal kind throws', () => {
  assert.throws(() => refusalHandler('mystery'), /no refusal handler for 'mystery'/);
});

test('the input unreachable handler stops the run BLOCKED and parks no task for an answer', () => {
  const line = refusalHandler('input unreachable');
  assert.match(line, /stop the run `BLOCKED`/);
  assert.ok(!line.includes('NEEDS ANSWER'));
});

test('a stop kind is not retryable', () => {
  for (const kind of ['refused', 'landed', 'pin', 'lock', 'unfinished merge', 'env', 'code rule', 'input unreachable']) assert.equal(isRetryable(kind), false, kind);
  for (const kind of ['proof failed', 'outside Files', 'report missing', 'plan drift']) assert.equal(isRetryable(kind), true, kind);
});

test('repair handoffs name build-repair and not hardest', () => {
  for (const kind of ['plan drift', 'proof failed']) {
    const line = refusalHandler(kind);
    assert.match(line, /exo-kind: build-repair/, kind);
    assert.doesNotMatch(line, /hardest/, kind);
  }
});

test('a land report breaking several rules gets one refusal naming each, and the third stops', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { landRefusal } = await import('../lib/refusal-handlers.mjs');
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refusal-'));
  const checks = ['a', 'b', 'c'].map((id) => ({ id, violation: () => `rule ${id} broken` }));
  const first = landRefusal(runDir, 1, checks, {});
  for (const id of ['a', 'b', 'c']) assert.match(first, new RegExp(`rule ${id} broken`));
  assert.match(first, /LOOP refusal CONTINUE/);
  landRefusal(runDir, 1, checks, {});
  const third = landRefusal(runDir, 1, checks, {});
  assert.match(third, /^LOOP refusal STOP .*cap.*: a, b, c\n$/);
  assert.equal(landRefusal(runDir, 1, [], {}), null);
});

test('out-of-scope: the third refusal of one task stops with LOOP refusal STOP cap', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { landRefusal } = await import('../lib/refusal-handlers.mjs');
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refusal-scope-'));
  const checks = [{ id: 'a', violation: () => 'rule a broken' }];
  assert.doesNotMatch(landRefusal(runDir, 1, checks, {}), /STOP/);
  assert.doesNotMatch(landRefusal(runDir, 1, checks, {}), /STOP/);
  assert.match(landRefusal(runDir, 1, checks, {}), /LOOP refusal STOP .*cap/);
});

test('a second task\'s first refusal is not stopped by an earlier task\'s refusals', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { landRefusal } = await import('../lib/refusal-handlers.mjs');
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refusal-tasks-'));
  const checks = [{ id: 'a', violation: () => 'rule a broken' }];
  for (let i = 0; i < 3; i++) landRefusal(runDir, 1, checks, {});
  assert.match(landRefusal(runDir, 1, checks, {}), /STOP/);
  assert.match(landRefusal(runDir, 2, checks, {}), /LOOP refusal CONTINUE/);
});

test('REFUSAL_RULES entries report their rule when named violated', async () => {
  const { REFUSAL_RULES, allViolations } = await import('../lib/refusal-rules.mjs');
  const found = allViolations(REFUSAL_RULES, { violated: ['repeat-stop', 'reddit-route'] });
  assert.deepEqual(found.map((entry) => entry.id), ['reddit-route', 'repeat-stop']);
});

test('the refusal loop kind is owned by the handlers module', () => {
  const kinds = JSON.parse(fs.readFileSync(new URL('../lib/loop-kinds.json', import.meta.url), 'utf8'));
  assert.equal(kinds['refusal'].owner, 'lib/refusal-handlers.mjs');
});
