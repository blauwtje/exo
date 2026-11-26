import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkModelRouting } from '../verify/checks/model-routing.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

function run(files) {
  return checkOutcome(checkModelRouting, createRepository(tree(files)));
}

test('a general-purpose dispatch that names a model passes', () => {
  const result = run({ 'skills/a/SKILL.md': 'Run a general-purpose helper with model sonnet.\n' });
  assert.equal(result.ok, true, result.detail);
});

test('a model with a colon passes', () => {
  const result = run({ 'agents/a.md': 'general-purpose, model: opus\n' });
  assert.equal(result.ok, true, result.detail);
});

test('a general-purpose dispatch with no model fails with its path and line', () => {
  const result = run({ 'skills/a/SKILL.md': 'one\nSend a general-purpose helper.\n' });
  assert.equal(result.ok, false);
  assert.match(result.detail, /skills\/a\/SKILL\.md:2 general-purpose with no model/);
});

test('a general-purpose line outside skills and agents passes', () => {
  const result = run({ 'docs/a.md': 'Send a general-purpose helper.\n' });
  assert.equal(result.ok, true, result.detail);
});

test('the word Fable in a skill fails with its path and line', () => {
  const result = run({ 'skills/a/SKILL.md': 'one\nRun it with model Fable.\n' });
  assert.equal(result.ok, false);
  assert.match(result.detail, /skills\/a\/SKILL\.md:2 fable/);
});

test('the word fable in an agent fails', () => {
  const result = run({ 'agents/a.md': 'use fable here\n' });
  assert.equal(result.ok, false);
  assert.match(result.detail, /agents\/a\.md:1 fable/);
});

test('fable outside skills and agents passes', () => {
  const result = run({ 'docs/a.md': 'fable\n' });
  assert.equal(result.ok, true, result.detail);
});

test('a script that starts claude -p with no --model fails with its path and line', () => {
  const result = run({ 'scripts/a.mjs': "const x = 1;\nspawn('claude', ['-p', prompt]);\n" });
  assert.equal(result.ok, false);
  assert.match(result.detail, /scripts\/a\.mjs:2 claude -p without --model/);
});

test('a script that starts claude --print with no --model fails', () => {
  const result = run({ 'a.sh': 'claude --print "hi"\n' });
  assert.equal(result.ok, false);
  assert.match(result.detail, /a\.sh:1 claude -p without --model/);
});

test('a script that starts claude -p with --model passes', () => {
  const result = run({ 'a.mjs': "spawn('claude', ['-p', '--model', 'sonnet']);\n" });
  assert.equal(result.ok, true, result.detail);
});

test('a shell script with --model and a space passes', () => {
  const result = run({ 'a.sh': 'claude -p --model sonnet "hi"\n' });
  assert.equal(result.ok, true, result.detail);
});

test('a script under tests with claude -p and no --model passes', () => {
  const result = run({ 'tests/a.mjs': "spawn('claude', ['-p']);\n" });
  assert.equal(result.ok, true, result.detail);
});

test('--model=sonnet with an equals sign passes', () => {
  const result = run({ 'a.sh': 'claude -p --model=sonnet "hi"\n' });
  assert.equal(result.ok, true, result.detail);
});

test('a general-purpose line that says model choice is up to you fails', () => {
  const result = run({ 'skills/a/SKILL.md': 'a general-purpose helper; model choice is up to you\n' });
  assert.equal(result.ok, false);
  assert.match(result.detail, /skills\/a\/SKILL\.md:1 general-purpose with no model/);
});

for (const model of ['sonnet', 'opus', 'haiku', 'inherit']) {
  test(`a general-purpose dispatch with model ${model} passes`, () => {
    const result = run({ 'agents/a.md': `general-purpose, model ${model}\n` });
    assert.equal(result.ok, true, result.detail);
  });
}

for (const file of ['verify/frontmatter.mjs', 'principles/a.md', 'tests/a.mjs', 'skills-extra/a.md']) {
  test(`fable in ${file} passes`, () => {
    const result = run({ [file]: 'fable\n' });
    assert.equal(result.ok, true, result.detail);
  });
}
