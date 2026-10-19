import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const prompts = JSON.parse(readFileSync(new URL('../benchmarks/routing/prompts.json', import.meta.url), 'utf8'));
const skillsDir = new URL('../skills/', import.meta.url);
const invocable = readdirSync(skillsDir).filter((name) => {
  const text = readFileSync(new URL(`${name}/SKILL.md`, skillsDir), 'utf8');
  const front = text.split('---')[1] ?? '';
  return !/^disable-model-invocation:\s*true/m.test(front);
});

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

test('each model-invocable skill and null has 10 prompts split 6 train, 4 held-out', () => {
  for (const key of [...invocable, null]) {
    const group = prompts.filter((p) => p.expect === key);
    assert.equal(group.length, 10, `${key} count`);
    assert.equal(group.filter((p) => p.split === 'train').length, 6, `${key} train`);
    assert.equal(group.filter((p) => p.split === 'held-out').length, 4, `${key} held-out`);
  }
});
