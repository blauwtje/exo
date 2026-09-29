// Which plugin copy a pressure run loads: --plugin-dir resolves against the
// caller's cwd and needs a manifest there, the comparison arm is no plugin or
// a second copy, and a skill base directory outside the arm's copy is a wrong
// copy only when it is a skill of the arm's plugin. The stream lines are shaped after a recorded `claude -p` run.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { comparisonArm, loadedSkillDirs, resolvePluginDir, wrongCopies } from '#plugin-copy';
import { UsageError } from '#script-flags';
import { fixture } from './harness.mjs';

const WORKTREE = '/Users/someone/exo/.worktrees/branch';
const MAIN = '/Users/someone/exo';

// The user event a Skill call adds once the skill loads, as recorded.
const loadedLine = (skillDir) => JSON.stringify({
  type: 'user',
  message: { role: 'user', content: [{ type: 'text', text: `Base directory for this skill: ${skillDir}\n\n# Shaping\n\n## Steps\n` }] }
});

async function pluginAt(directory, name = 'fixture-plugin', skills = []) {
  await fs.mkdir(path.join(directory, '.claude-plugin'), { recursive: true });
  await fs.writeFile(path.join(directory, '.claude-plugin', 'plugin.json'), JSON.stringify({ name }));
  for (const skill of skills) await fs.mkdir(path.join(directory, 'skills', skill), { recursive: true });
}

test('a relative plugin directory resolves against the given cwd, not the process cwd', async () => {
  const caller = await fixture();
  await pluginAt(path.join(caller, 'clone'));
  assert.equal(resolvePluginDir('--plugin-dir', 'clone', caller), path.join(caller, 'clone'));
  assert.equal(resolvePluginDir('--plugin-dir', '.', path.join(caller, 'clone')), path.join(caller, 'clone'));
});

test('a plugin directory with no manifest is a usage error naming the resolved manifest path', async () => {
  const caller = await fixture();
  assert.throws(() => resolvePluginDir('--main-dir', 'missing', caller), (error) =>
    error instanceof UsageError && error.message.includes(`--main-dir needs a readable '${path.join(caller, 'missing', '.claude-plugin', 'plugin.json')}'`));
});

test('the comparison arm is no plugin without a main directory and the main copy with one', () => {
  assert.deepEqual(comparisonArm({ pluginId: 'exo@blauwtje', mainDir: undefined }), {
    name: 'without', pluginDir: undefined, flags: ['--settings', '{"enabledPlugins":{"exo@blauwtje":false}}']
  });
  assert.deepEqual(comparisonArm({ pluginId: 'exo@blauwtje', mainDir: MAIN }), {
    name: 'main', pluginDir: MAIN, flags: ['--plugin-dir', MAIN]
  });
});

test('the base directory of a loaded skill is read from a recorded user line, and other events give none', () => {
  assert.deepEqual(loadedSkillDirs(JSON.parse(loadedLine(`${WORKTREE}/skills/spec`))), [`${WORKTREE}/skills/spec`]);
  const toolResult = { type: 'user', message: { content: [{ type: 'tool_result', content: [{ type: 'text', text: `Base directory for this skill: ${MAIN}/skills/ship` }] }] } };
  assert.deepEqual(loadedSkillDirs(toolResult), [`${MAIN}/skills/ship`]);
  assert.deepEqual(loadedSkillDirs({ type: 'assistant', message: { content: [{ type: 'text', text: `Base directory for this skill: ${MAIN}/skills/x` }] } }), []);
});

test('a skill loaded from main while the arm points at a worktree is a wrong copy; one under the worktree is not', () => {
  const dirs = [`${WORKTREE}/skills/spec`, `${MAIN}/skills/spec`, `${WORKTREE}-other/skills/spec`];
  assert.deepEqual(wrongCopies(dirs, WORKTREE), [`${MAIN}/skills/spec`, `${WORKTREE}-other/skills/spec`]);
  assert.deepEqual(wrongCopies(dirs, undefined), []);
});

test('a skill of another plugin or a personal skill is not a wrong copy, even when it shares a name', async () => {
  const root = await fixture();
  const clone = path.join(root, 'clone');
  await pluginAt(clone, 'exo', ['spec', 'ship']);
  await pluginAt(path.join(root, 'other'), 'other', ['spec', 'lint']);
  const personal = path.join(root, 'home', '.claude', 'skills', 'synced');
  await fs.mkdir(personal, { recursive: true });
  const dirs = [path.join(root, 'other', 'skills', 'spec'), path.join(root, 'other', 'skills', 'lint'), personal];
  assert.deepEqual(wrongCopies(dirs, clone), []);
});

test('a skill of the same plugin loaded from the main checkout while the arm points at a clone is a wrong copy', async () => {
  const root = await fixture();
  const clone = path.join(root, 'clone');
  await pluginAt(clone, 'exo', ['spec', 'ship']);
  await pluginAt(path.join(root, 'main'), 'exo', ['spec', 'ship']);
  const dirs = [path.join(clone, 'skills', 'spec'), path.join(root, 'main', 'skills', 'ship')];
  assert.deepEqual(wrongCopies(dirs, clone), [path.join(root, 'main', 'skills', 'ship')]);
});

test('a removed copy with no manifest is a wrong copy when its skill name is one of the arm plugin skills', async () => {
  const root = await fixture();
  const clone = path.join(root, 'clone');
  await pluginAt(clone, 'exo', ['spec']);
  const dirs = [path.join(root, 'gone', 'skills', 'spec'), path.join(root, 'gone', 'skills', 'unrelated')];
  assert.deepEqual(wrongCopies(dirs, clone), [path.join(root, 'gone', 'skills', 'spec')]);
});
