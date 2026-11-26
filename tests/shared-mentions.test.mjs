import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { checkSharedMentions, writeSharedMentions } from '../verify/checks/shared-mentions.mjs';
import { createRepository } from '../verify/repository.mjs';
import { recorder, tree } from './check-outcome.mjs';

const REGISTRY = 'verify/checks/shared-mentions.json';
const entry = (fields) => ({ file: 'guide/spec.md', pattern: 'at most (\\d+) tasks', value: 'SELF_BUILD_TASKS', ...fields });
const frontmatterEntry = { file: 'skills/build/SKILL.md', pattern: '\\| Build \\| (\\w+),', value: 'agents/builder.md#model' };

function files(overrides = {}) {
  return {
    'lib/shared-values.mjs': 'export const SELF_BUILD_TASKS = 3;\nexport const SHIP_WAIT_MS = 1200000;\n',
    'guide/spec.md': 'A plan of at most 3 tasks skips research.\n',
    'skills/build/SKILL.md': '| Build | Sonnet, medium |\n',
    'agents/builder.md': '---\nname: builder\nmodel: sonnet\n---\nBody\n',
    [REGISTRY]: JSON.stringify([entry({})]),
    ...overrides
  };
}

async function outcome(overrides) {
  const report = recorder();
  await checkSharedMentions(report, createRepository(tree(files(overrides))));
  return report.results[0];
}

test('a mention equal to its value passes', async () => {
  const result = await outcome({});
  assert.equal(result.status, 'PASS', result.detail);
});

test('a changed capture fails', async () => {
  const result = await outcome({ 'guide/spec.md': 'A plan of at most 5 tasks skips research.\n' });
  assert.equal(result.status, 'FAIL');
  assert.match(result.detail, /guide\/spec\.md: 5 is not 3 \(SELF_BUILD_TASKS\)/);
});

test('a removed mention fails as a stale pattern', async () => {
  const result = await outcome({ 'guide/spec.md': 'Nothing here.\n' });
  assert.equal(result.status, 'FAIL');
  assert.match(result.detail, /guide\/spec\.md: pattern at most \(\\d\+\) tasks matches nothing/);
});

test('a unit converts a millisecond value before the compare', async () => {
  const unit = entry({ file: 'guide/ship.md', pattern: 'after (\\d+) minutes', value: 'SHIP_WAIT_MS', unit: 'min' });
  const result = await outcome({ 'guide/ship.md': 'The wait stops after 20 minutes.\n', [REGISTRY]: JSON.stringify([unit]) });
  assert.equal(result.status, 'PASS', result.detail);
});

test('a frontmatter mismatch fails and a case difference passes', async () => {
  const registry = { [REGISTRY]: JSON.stringify([frontmatterEntry]) };
  const same = await outcome(registry);
  assert.equal(same.status, 'PASS', same.detail);
  const result = await outcome({ ...registry, 'agents/builder.md': '---\nmodel: opus\n---\n' });
  assert.equal(result.status, 'FAIL');
  assert.match(result.detail, /skills\/build\/SKILL\.md: Sonnet is not opus \(agents\/builder\.md#model\)/);
});

test('a malformed entry fails naming the entry instead of throwing', async () => {
  const unknown = await outcome({ [REGISTRY]: JSON.stringify([entry({ value: 'NO_SUCH_VALUE' })]) });
  assert.equal(unknown.status, 'FAIL');
  assert.match(unknown.detail, /NO_SUCH_VALUE/);
  const missing = await outcome({ [REGISTRY]: JSON.stringify([{ pattern: 'x', value: 'SELF_BUILD_TASKS' }]) });
  assert.equal(missing.status, 'FAIL');
  assert.match(missing.detail, /malformed entry/);
});

test('write mode rewrites a module capture and skips a frontmatter entry', async () => {
  const root = tree(files({
    'guide/spec.md': 'A plan of at most 5 tasks skips research.\n',
    'skills/build/SKILL.md': '| Build | Opus, medium |\n',
    [REGISTRY]: JSON.stringify([entry({}), frontmatterEntry])
  }));
  await writeSharedMentions(root);
  assert.equal(fs.readFileSync(path.join(root, 'guide/spec.md'), 'utf8'), 'A plan of at most 3 tasks skips research.\n');
  assert.equal(fs.readFileSync(path.join(root, 'skills/build/SKILL.md'), 'utf8'), '| Build | Opus, medium |\n');
});
