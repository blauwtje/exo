import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPluginShape } from '../verify/checks/plugin-shape.mjs';
import { createRepository } from '../verify/repository.mjs';
import { REPOSITORY_ROOT } from './harness.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

const skill = (body) => `---\nname: a\ndescription: "Does a. Use when a."\n---\n\n${body}\n`;
const GOOD_SKILL = skill('# A\n\n**One rule.** Why it holds.\n\n| You think | Do instead |\n|---|---|\n| x | y |\n\nMore in [references/more.md](references/more.md).\n\n```text\nexample\n```');
const GOOD_AGENT = '---\nname: helper\n---\n\n# Helper\n\nYou are a helper.\n\n```text\nDONE\n```\n';
const GOOD_HOOK = JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'cat "${CLAUDE_PLUGIN_ROOT}/BASE.md"' }] }] } });
const GOOD = {
  'skills/a/SKILL.md': GOOD_SKILL,
  'skills/a/references/more.md': '# More',
  'agents/helper.md': GOOD_AGENT,
  'hooks/hooks.json': GOOD_HOOK
};

const run = (changes) => checkOutcome(checkPluginShape, createRepository(tree({ ...GOOD, ...changes })));

test('a skill, agent and hook in the standard shape pass', () => {
  const result = run({});
  assert.equal(result.ok, true, result.detail);
});

test('a skill without a # title fails', () => {
  const result = run({ 'skills/a/SKILL.md': skill('**One rule.**\n\n| a |\n\n[m](references/more.md)') });
  assert.match(result.detail, /skills\/a\/SKILL\.md does not open with a # title/);
});

test('a skill whose first paragraph is not a bold rule fails', () => {
  const result = run({ 'skills/a/SKILL.md': skill('# A\n\nOne rule.\n\n| a |\n\n[m](references/more.md)') });
  assert.match(result.detail, /skills\/a\/SKILL\.md does not open its first paragraph with a bold rule/);
});

test('a skill with a table but no code block fails', () => {
  const result = run({ 'skills/a/SKILL.md': skill('# A\n\n**One rule.**\n\n| a | b |\n\n[m](references/more.md)') });
  assert.match(result.detail, /skills\/a\/SKILL\.md holds no example/);
});

test('a reference file the skill does not link fails', () => {
  const result = run({ 'skills/a/references/other.md': '# Other' });
  assert.match(result.detail, /skills\/a\/references\/other\.md is not linked from skills\/a\/SKILL\.md/);
});

test('a skill that names BASE.md fails', () => {
  const result = run({ 'skills/a/SKILL.md': GOOD_SKILL + '\n1. Read BASE.md.\n' });
  assert.match(result.detail, /skills\/a\/SKILL\.md names BASE\.md/);
});

test('an agent with no title or report example fails', () => {
  const result = run({ 'agents/helper.md': '---\nname: helper\n---\n\nYou are a helper.\n' });
  assert.match(result.detail, /agents\/helper\.md does not open with a # title/);
  assert.match(result.detail, /agents\/helper\.md holds no report example/);
});

test('a missing SessionStart hook fails', () => {
  const result = run({ 'hooks/hooks.json': JSON.stringify({ hooks: {} }) });
  assert.match(result.detail, /hooks\/hooks\.json runs no SessionStart command that prints BASE\.md/);
});

test('the real repository passes', () => {
  const result = checkOutcome(checkPluginShape, createRepository(REPOSITORY_ROOT));
  assert.equal(result.ok, true, result.detail);
});
