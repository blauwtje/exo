import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSkillFrontmatter } from '../verify/checks/skill-frontmatter.mjs';

const BASE = [
  'name: demo',
  'description: Use when testing a check. Not for real skills.',
];

function fakeRepository(file, lines) {
  return {
    skillsRoot: '/skills',
    walk: () => [],
    skillDirectories: () => [],
    everySkillFile: () => [file],
    relative: (target) => target,
    lines: () => lines,
  };
}

function collectingReport(results) {
  return {
    assert(condition, checkName, ...details) {
      const detail = condition ? details[0] : details[1];
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
];

for (const line of ACCEPTED_KEYS) {
  test(`accepts ${line.split(':')[0]}`, () => {
    const outcome = frontmatterResult(null, [line]);
    assert.equal(outcome.passed, true, outcome.detail);
  });
}

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

test('rejects when_to_use', () => {
  assert.equal(frontmatterResult(null, ['when_to_use: Use when testing']).passed, false);
});
