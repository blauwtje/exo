import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSkillSections, skillSectionErrors } from '../verify/checks/skill-sections.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

const FRONTMATTER = [
  '---',
  'name: demo',
  'description: Use when testing. Not for real skills.',
  'metadata:',
  '  author: exo',
  '  tags: [demo, test]',
  '---'
];
const HEADINGS = ['Purpose', 'Prerequisites', 'Instructions', 'Examples', 'Limitations', 'Troubleshooting'];
const TROUBLESHOOTING_TABLE = '| Error | Cause | Solution |\n| --- | --- | --- |\n| a | b | c |';
const SCRIPTS_TABLE = '| Script | Purpose | Arguments |\n| --- | --- | --- |\n| `run.mjs` | runs | none |';

function section(heading) {
  return `## ${heading}\n${heading === 'Troubleshooting' ? TROUBLESHOOTING_TABLE : 'Text.'}\n`;
}

function skill({ headings = HEADINGS, frontmatter = FRONTMATTER, scripts = '' } = {}) {
  const body = headings.map(section).join('\n');
  return `${frontmatter.join('\n')}\n\n# Demo\n\n${body}${scripts}`;
}

function errorsFor(files) {
  return skillSectionErrors(createRepository(tree(files)));
}

test('a skill with the six sections, metadata and no scripts passes', () => {
  const root = tree({ 'skills/demo/SKILL.md': skill() });
  const result = checkOutcome(checkSkillSections, createRepository(root));
  assert.equal(result.ok, true, result.detail);
});

test('a missing section passes', () => {
  const errors = errorsFor({ 'skills/demo/SKILL.md': skill({ headings: HEADINGS.filter((name) => name !== 'Examples') }) });
  assert.deepEqual(errors, []);
});

test('an extra ## heading passes', () => {
  const errors = errorsFor({ 'skills/demo/SKILL.md': skill({ headings: [...HEADINGS, 'Models'] }) });
  assert.deepEqual(errors, []);
});

test('a misordered section passes', () => {
  const swapped = ['Purpose', 'Instructions', 'Prerequisites', 'Examples', 'Limitations', 'Troubleshooting'];
  const errors = errorsFor({ 'skills/demo/SKILL.md': skill({ headings: swapped }) });
  assert.deepEqual(errors, []);
});

test('a ## line inside a code fence is not a heading', () => {
  const text = skill().replace('Text.\n\n## Prerequisites', 'Text.\n```\n## Fake\n```\n\n## Prerequisites');
  assert.deepEqual(errorsFor({ 'skills/demo/SKILL.md': text }), []);
});

test('missing metadata author and tags are named', () => {
  const frontmatter = FRONTMATTER.filter((line) => !/^metadata:|^ {2}/.test(line));
  const errors = errorsFor({ 'skills/demo/SKILL.md': skill({ frontmatter }) }).join('\n');
  assert.match(errors, /metadata\.author/);
  assert.match(errors, /metadata\.tags/);
});

test('a troubleshooting table with another header fails', () => {
  const text = skill().replace('| Error | Cause | Solution |', '| Problem | Cause | Fix |');
  assert.match(errorsFor({ 'skills/demo/SKILL.md': text }).join('\n'), /Troubleshooting/);
});

test('a scripts folder without an Available Scripts section passes', () => {
  const errors = errorsFor({ 'skills/demo/SKILL.md': skill(), 'skills/demo/scripts/run.mjs': '' });
  assert.deepEqual(errors, []);
});

test('an Available Scripts table whose file exists passes', () => {
  const text = skill({ headings: [...HEADINGS, 'Available Scripts'] }).replace(
    /## Available Scripts\nText\.\n/,
    `## Available Scripts\n${SCRIPTS_TABLE}\n`
  );
  assert.deepEqual(errorsFor({ 'skills/demo/SKILL.md': text, 'skills/demo/scripts/run.mjs': '' }), []);
});

test('an Available Scripts row naming a missing file fails', () => {
  const text = skill({ headings: [...HEADINGS, 'Available Scripts'] }).replace(
    /## Available Scripts\nText\.\n/,
    `## Available Scripts\n${SCRIPTS_TABLE.replace('run.mjs', 'gone.mjs')}\n`
  );
  const errors = errorsFor({ 'skills/demo/SKILL.md': text, 'skills/demo/scripts/run.mjs': '' });
  assert.match(errors.join('\n'), /gone\.mjs/);
});

test('an Available Scripts section without a scripts folder fails', () => {
  const errors = errorsFor({ 'skills/demo/SKILL.md': skill({ headings: [...HEADINGS, 'Available Scripts'] }) });
  assert.equal(errors.length > 0, true);
});

test('a troubleshooting table without a separator row fails', () => {
  const text = skill().replace('| --- | --- | --- |\n', '');
  assert.match(errorsFor({ 'skills/demo/SKILL.md': text }).join('\n'), /Troubleshooting/);
});

test('a troubleshooting table without a data row fails', () => {
  const text = skill().replace('\n| a | b | c |', '');
  assert.match(errorsFor({ 'skills/demo/SKILL.md': text }).join('\n'), /Troubleshooting/);
});

test('a script the text runs without an Available Scripts row passes', () => {
  const text = skill({ headings: [...HEADINGS, 'Available Scripts'] })
    .replace(/## Available Scripts\nText\.\n/, `## Available Scripts\n${SCRIPTS_TABLE}\n`)
    .replace('## Purpose\nText.', '## Purpose\nRun `node scripts/other.mjs` first.');
  const files = { 'skills/demo/SKILL.md': text, 'skills/demo/scripts/run.mjs': '', 'skills/demo/scripts/other.mjs': '' };
  assert.deepEqual(errorsFor(files), []);
});

test('a script the text names that does not exist fails', () => {
  const text = skill().replace('## Purpose\nText.', '## Purpose\nRun `node scripts/gone.mjs` first.');
  const errors = errorsFor({ 'skills/demo/SKILL.md': text });
  assert.match(errors.join('\n'), /gone\.mjs/);
});
