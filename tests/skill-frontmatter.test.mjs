import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSkillFrontmatter } from '../scripts/checks/skill-frontmatter.mjs';

const BASE = [
  'name: demo',
  'description: Use when testing a check. Not for real skills.',
];

function fakeRepository(file, lines) {
  return {
    everySkillFile: () => [file],
    relative: (target) => target,
    lines: () => lines,
  };
}

function collectingReport(results) {
  return {
    assert(condition, checkName, details) {
      const detail = condition ? details.pass : details.fail;
      results.push({ name: checkName, passed: condition, detail });
    },
  };
}

function frontmatterResult(name, extraLines) {
  const lines = ['---', ...BASE.map((line) => (name ? line.replace('demo', name) : line)), ...extraLines, '---', 'Body.'];
  const results = [];
  checkSkillFrontmatter(collectingReport(results), fakeRepository(`/skills/${name ?? 'demo'}/SKILL.md`, lines));
  return results.find((entry) => entry.name === 'YAML frontmatter');
}

const ACCEPTED_KEYS = [
  'license: MIT',
  'compatibility: Needs node 20',
  'user-invocable: false',
  'disallowed-tools: Bash',
  'context: fork',
  'agent: Explore',
  'when_to_use: Use when testing',
  'arguments: issue branch',
  'background: false',
  'paths: "src/**/*.js"',
];

for (const line of ACCEPTED_KEYS) {
  test(`accepts ${line.split(':')[0]}`, () => {
    const outcome = frontmatterResult(null, [line]);
    assert.equal(outcome.passed, true, outcome.detail);
  });
}

test('accepts a description of 35 words and rejects 36', () => {
  const filler = (count) => Array.from({ length: count }, (_, index) => `w${index}`).join(' ');
  const run = (count) => {
    const lines = ['---', 'name: demo', `description: Use when testing. Not for real skills. ${filler(count - 7)}`, '---', 'Body.'];
    const results = [];
    checkSkillFrontmatter(collectingReport(results), fakeRepository('/skills/demo/SKILL.md', lines));
    return results.find((entry) => entry.name === 'YAML frontmatter');
  };
  assert.equal(run(35).passed, true, run(35).detail);
  const outcome = run(36);
  assert.equal(outcome.passed, false);
  assert.match(outcome.detail, /36 words, over 35/);
});

test('rejects a name holding claude', () => {
  assert.equal(frontmatterResult('claude-x', []).passed, false);
});

test('rejects a name holding anthropic', () => {
  assert.equal(frontmatterResult('anthropic-x', []).passed, false);
});

test('accepts a 500-char compatibility and rejects 501', () => {
  assert.equal(frontmatterResult(null, [`compatibility: ${'a'.repeat(500)}`]).passed, true);
  assert.equal(frontmatterResult(null, [`compatibility: ${'a'.repeat(501)}`]).passed, false);
});

test('rejects a non-boolean user-invocable', () => {
  assert.equal(frontmatterResult(null, ['user-invocable: maybe']).passed, false);
});

test('rejects hooks and points to CONTRIBUTING.md', () => {
  const outcome = frontmatterResult(null, ['hooks: {}']);
  assert.equal(outcome.passed, false);
  assert.match(outcome.detail, /CONTRIBUTING\.md/);
});

test('rejects a non-boolean background', () => {
  assert.equal(frontmatterResult(null, ['background: maybe']).passed, false);
});

test('rejects the list form of arguments, naming the field', () => {
  const outcome = frontmatterResult(null, ['arguments: [issue, branch]']);
  assert.equal(outcome.passed, false);
  assert.match(outcome.detail, /arguments/);
});

test('rejects description plus when_to_use over 1536 characters', () => {
  assert.equal(frontmatterResult(null, [`when_to_use: ${'a'.repeat(1500)}`]).passed, false);
  assert.equal(frontmatterResult(null, [`when_to_use: ${'a'.repeat(1000)}`]).passed, true);
});
