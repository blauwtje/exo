import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkAgentFrontmatter } from '../verify/checks/agent-frontmatter.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

const GOOD = {
  name: 'demo',
  description: '"Does one job."',
  tools: 'Read, Bash',
  model: 'sonnet',
  color: 'purple',
  effort: 'medium',
  maxTurns: '60'
};

function agent(changes = {}) {
  const fields = { ...GOOD, ...changes };
  const lines = Object.entries(fields).filter(([, value]) => value !== null).map(([key, value]) => `${key}: ${value}`);
  return `---\n${lines.join('\n')}\n---\n# Demo\n`;
}

function outcome(files) {
  return checkOutcome(checkAgentFrontmatter, createRepository(tree(files)));
}

function agentOutcome(changes) {
  return outcome({ 'agents/demo.md': agent(changes) });
}

test('a documented agent passes', () => {
  const result = agentOutcome({});
  assert.equal(result.ok, true, result.detail);
});

test('a full claude model id passes', () => {
  assert.equal(agentOutcome({ model: 'claude-sonnet-5-5' }).ok, true);
});

const BAD = {
  'a model outside the list': { model: 'gpt-4' },
  'an effort outside the list': { effort: 'ultra' },
  'a color outside the list': { color: 'magenta' },
  'a missing color': { color: null },
  'a non-numeric maxTurns': { maxTurns: 'lots' },
  'a zero maxTurns': { maxTurns: '0' },
  'a fractional maxTurns': { maxTurns: '2.5' },
  'a bare claude- model': { model: 'claude-' },
  'a misspelled field': { colour: 'red' },
  'a missing name': { name: null },
  'a missing description': { description: null },
  'a name holding a colon': { name: 'a:b' },
  'a name starting with a dash': { name: '-a' },
  'a name over 256 characters': { name: 'a'.repeat(257) }
};

for (const [label, changes] of Object.entries(BAD)) {
  test(`fails ${label}`, () => {
    assert.equal(agentOutcome(changes).ok, false);
  });
}

test('an output style with a misspelled key fails', () => {
  const style = '---\nname: x\ndescription: y\nkeep-coding-instruction: true\n---\nBody\n';
  assert.equal(outcome({ 'output-styles/x.md': style }).ok, false);
});

test('an output style with the documented keys passes', () => {
  const style = '---\nname: x\ndescription: y\nkeep-coding-instructions: true\nforce-for-plugin: false\n---\nBody\n';
  const result = outcome({ 'output-styles/x.md': style });
  assert.equal(result.ok, true, result.detail);
});
