import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { modelInvocableSkills, quickPrompts } from '../benchmarks/routing.mjs';

const prompts = JSON.parse(readFileSync(new URL('../benchmarks/routing/prompts.json', import.meta.url), 'utf8'));
const invocable = modelInvocableSkills(fileURLToPath(new URL('..', import.meta.url)));

test('every entry has a prompt, a valid expect and a valid split', () => {
  assert.ok(Array.isArray(prompts));
  for (const p of prompts) {
    assert.equal(typeof p.prompt, 'string');
    assert.ok(p.prompt.length > 0);
    assert.ok(p.expect === null || invocable.includes(p.expect), `bad expect ${p.expect}`);
    assert.ok(['train', 'held-out'].includes(p.split), `bad split ${p.split}`);
  }
  assert.equal(new Set(prompts.map((p) => p.prompt)).size, prompts.length);
});

test('each model-invocable skill and null has at least 30 prompts, at least 15 train and 15 held-out', () => {
  for (const key of [...invocable, null]) {
    const group = prompts.filter((p) => p.expect === key);
    assert.ok(group.length >= 30, `${key} count ${group.length}`);
    assert.ok(group.filter((p) => p.split === 'train').length >= 15, `${key} train`);
    assert.ok(group.filter((p) => p.split === 'held-out').length >= 15, `${key} held-out`);
  }
});

test('the quick set is held-out only, covers every model-invocable skill and none, and stays fixed in size', () => {
  const quick = quickPrompts(prompts);
  assert.ok(quick.every((p) => p.split === 'held-out'));
  assert.deepEqual([...new Set(quick.map((p) => p.expect))].sort(), [...invocable, null].sort());
  assert.equal(quick.length, invocable.length + 4);
  assert.deepEqual(quickPrompts(prompts), quick);
});
