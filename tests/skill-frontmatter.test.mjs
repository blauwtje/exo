import fs from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSkillFrontmatter } from '../verify/checks/skill-frontmatter.mjs';
import { readFrontmatter } from '../verify/frontmatter.mjs';

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
    trackedFiles: () => [],
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

function skillLines(name, extraLines) {
  return ['---', `name: ${name}`, 'description: Use when testing a check. Not for real skills.', ...extraLines, '---', 'Body.'];
}

function namingResult(files) {
  const contents = new Map(Object.entries(files));
  const skillPaths = [...contents.keys()].filter((file) => file.endsWith('/SKILL.md'));
  const repository = {
    skillsRoot: '/skills',
    walk: () => [],
    skillDirectories: () => [],
    everySkillFile: () => skillPaths,
    relative: (target) => target,
    lines: (file) => contents.get(file),
    trackedFiles: () => [...contents.keys()],
  };
  const results = [];
  checkSkillFrontmatter(collectingReport(results), repository);
  return results.find((entry) => entry.name === 'user-only skill names');
}

const USER_ONLY = skillLines('loop', ['disable-model-invocation: true']);
const MODEL_FACING = skillLines('helper', []);

test('flags a bare exo:<name> of a user-only skill in model-facing text', () => {
  const outcome = namingResult({
    'skills/loop/SKILL.md': USER_ONLY,
    'skills/helper/SKILL.md': MODEL_FACING,
    'agents/worker.md': ['Intro.', 'Call exo:loop now.'],
  });
  assert.equal(outcome.passed, false);
  assert.match(outcome.detail, /agents\/worker\.md:2 → loop/);
});

test('allows /exo:<name> as text for the user to type', () => {
  const outcome = namingResult({
    'skills/loop/SKILL.md': USER_ONLY,
    'skills/helper/SKILL.md': MODEL_FACING,
    'hooks/notice.md': ['Type /exo:loop to start.'],
  });
  assert.equal(outcome.passed, true, outcome.detail);
});

test('allows a bare exo:<name> of a model-invocable skill', () => {
  const outcome = namingResult({
    'skills/loop/SKILL.md': USER_ONLY,
    'skills/helper/SKILL.md': MODEL_FACING,
    'lib/note.md': ['Run exo:helper first.'],
  });
  assert.equal(outcome.passed, true, outcome.detail);
});

test('does not match a longer skill name sharing the prefix', () => {
  const outcome = namingResult({
    'skills/loop/SKILL.md': USER_ONLY,
    'skills/helper/SKILL.md': MODEL_FACING,
    'lib/note.md': ['Run exo:loop-extra first.'],
  });
  assert.equal(outcome.passed, true, outcome.detail);
});

test('ignores files outside skills, agents, hooks and lib', () => {
  const outcome = namingResult({
    'skills/loop/SKILL.md': USER_ONLY,
    'skills/helper/SKILL.md': MODEL_FACING,
    'README.md': ['Run exo:loop first.'],
  });
  assert.equal(outcome.passed, true, outcome.detail);
});

const ON_REQUEST_SKILLS = ['save-session', 'prompt', 'remember', 'configure', 'start', 'write-docs', 'edit-skills'];
const ON_REQUEST_DESCRIPTION_CAP = 160;

function realFrontmatter(name) {
  const file = new URL(`../skills/${name}/SKILL.md`, import.meta.url);
  return readFrontmatter(fs.readFileSync(file, 'utf8').split('\n')).values;
}

for (const name of ON_REQUEST_SKILLS) {
  test(`${name} is model-invocable on the user's request`, () => {
    const values = realFrontmatter(name);
    const description = values.get('description');
    assert.notEqual(values.get('disable-model-invocation'), 'true');
    assert.ok(description.startsWith('Use when the user asks'), description);
    assert.match(description, /\bNot for\b/);
    assert.ok(description.length <= ON_REQUEST_DESCRIPTION_CAP, `${description.length} chars`);
  });
}
