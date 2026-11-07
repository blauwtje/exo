import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { modelInvocableSkills } from '../benchmarks/routing.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const prompts = JSON.parse(readFileSync(`${root}benchmarks/routing/prompts.json`, 'utf8'));
const invocable = modelInvocableSkills(root);
const nearMisses = prompts.filter((entry) => entry.shadows);

function description(skill) {
  const text = readFileSync(`${root}skills/${skill}/SKILL.md`, 'utf8');
  return text.match(/^description: (.*)$/m)[1];
}

function words(text) {
  return new Set(text.toLowerCase().match(/[a-z]{4,}/g));
}

function sharedWords(prompt, skill) {
  const own = words(description(skill));
  return [...words(prompt)].filter((word) => own.has(word));
}

test('every model-invocable skill has a near-miss prompt that names the sibling it resembles', () => {
  for (const skill of invocable) {
    assert.ok(nearMisses.some((entry) => entry.expect === skill), `${skill} has no near-miss`);
  }
});

test('a near-miss expects one skill and shadows a different model-invocable sibling', () => {
  for (const entry of nearMisses) {
    assert.ok(invocable.includes(entry.expect), entry.prompt);
    assert.ok(invocable.includes(entry.shadows), entry.prompt);
    assert.notEqual(entry.expect, entry.shadows, entry.prompt);
  }
});

test('a near-miss prompt reuses wording from its sibling description yet more from its own', () => {
  for (const entry of nearMisses) {
    const sibling = sharedWords(entry.prompt, entry.shadows).length;
    const own = sharedWords(entry.prompt, entry.expect).length;
    assert.ok(sibling >= 1, `no sibling wording: ${entry.prompt}`);
    assert.ok(own >= sibling, `${entry.prompt} fits ${entry.shadows} (${sibling}) better than ${entry.expect} (${own})`);
  }
});
