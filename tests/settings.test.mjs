// settings.mjs resolves each exo setting from the local file, the project file,
// the plugin's global options and the schema default, in that order, and
// writes only the two files a repository holds.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const SETTINGS = fileURLToPath(new URL('../skills/settings/scripts/settings.mjs', import.meta.url));

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function workspace({ project, local, global } = {}) {
  const root = await fixture();
  const configDirectory = await fixture();
  if (project) await writeJson(path.join(root, '.claude', 'exo.json'), project);
  if (local) await writeJson(path.join(root, '.claude', 'exo.local.json'), local);
  if (global) {
    await writeJson(path.join(configDirectory, 'settings.json'), { pluginConfigs: { 'exo@blauwtje': { options: global } } });
  }
  const env = { CLAUDE_PROJECT_DIR: root, CLAUDE_CONFIG_DIR: configDirectory, CLAUDE_PLUGIN_OPTION_SPECS: '', CLAUDE_PLUGIN_OPTION_REPLIES: '', CLAUDE_PLUGIN_OPTION_CONTEXT: '' };
  return { root, env };
}

async function settings(space, args, extraEnv = {}) {
  return run(SETTINGS, args, { cwd: space.root, env: { ...space.env, ...extraEnv } });
}

test('with nothing set the schema default applies', async () => {
  const result = await settings(await workspace(), ['context']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'exo settings: specs=docs (default), replies=tight (default), interview=chat (default), context=80 (default)');
});

test('local outranks project, which outranks global', async () => {
  const layered = await workspace({ project: { specs: 'issues' }, local: { specs: 'both' }, global: { specs: 'docs' } });
  assert.equal((await settings(layered, ['get', 'specs'])).stdout.trim(), 'both');
  const shared = await workspace({ project: { specs: 'issues' }, global: { specs: 'both' } });
  assert.equal((await settings(shared, ['context'])).stdout.trim(), 'exo settings: specs=issues (project), replies=tight (default), interview=chat (default), context=80 (default)');
  const globalOnly = await workspace({ global: { specs: 'both' } });
  assert.equal((await settings(globalOnly, ['context'])).stdout.trim(), 'exo settings: specs=both (global), replies=tight (default), interview=chat (default), context=80 (default)');
});

test('the hook environment carries the global value when it is set', async () => {
  const space = await workspace({ global: { specs: 'docs' } });
  const result = await settings(space, ['context'], { CLAUDE_PLUGIN_OPTION_SPECS: 'issues' });
  assert.equal(result.stdout.trim(), 'exo settings: specs=issues (global), replies=tight (default), interview=chat (default), context=80 (default)');
});

test('replies is tight by default and standard when the project sets it', async () => {
  const unset = await workspace();
  assert.equal((await settings(unset, ['get', 'replies'])).stdout.trim(), 'tight');
  const project = await workspace({ project: { replies: 'standard' } });
  assert.equal((await settings(project, ['get', 'replies'])).stdout.trim(), 'standard');
});

test('set writes the project file and rejects a value the schema does not allow', async () => {
  const space = await workspace();
  const written = await settings(space, ['set', 'specs', 'issues', '--scope', 'project']);
  assert.equal(written.code, 0, written.stderr);
  const stored = JSON.parse(await fs.readFile(path.join(space.root, '.claude', 'exo.json'), 'utf8'));
  assert.deepEqual(stored, { specs: 'issues' });
  const rejected = await settings(space, ['set', 'specs', 'wiki', '--scope', 'project']);
  assert.equal(rejected.code, 1);
  assert.match(rejected.stderr, /specs=wiki is not one of docs, issues, both/);
});

test('set refuses the global scope and points at /config', async () => {
  const result = await settings(await workspace(), ['set', 'specs', 'issues', '--scope', 'global']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /\/config/);
});

test('a local value in a git repository adds its file to .gitignore', async () => {
  const space = await workspace();
  assert.equal(spawnSync('git', ['-C', space.root, 'init', '-q']).status, 0);
  // A global excludes file that ignores .claude/ would hide the entry this test expects.
  const result = await settings(space, ['set', 'specs', 'both', '--scope', 'local'], { GIT_CONFIG_GLOBAL: '/dev/null' });
  assert.equal(result.code, 0, result.stderr);
  const ignore = await fs.readFile(path.join(space.root, '.gitignore'), 'utf8');
  assert.ok(ignore.split('\n').includes('.claude/exo.local.json'), ignore);
});

test('a project file that is not JSON is named in the context line, and defaults apply', async () => {
  const space = await workspace();
  await fs.mkdir(path.join(space.root, '.claude'), { recursive: true });
  await fs.writeFile(path.join(space.root, '.claude', 'exo.json'), '{ not json');
  const result = await settings(space, ['context']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^exo settings: specs=docs \(default\), replies=tight \(default\), interview=chat \(default\), context=80 \(default\); .*exo\.json is not valid JSON/);
});

test('an unreadable user settings file still shows the other layers and names the file', async () => {
  const space = await workspace({ project: { specs: 'issues' }, global: { specs: 'both' } });
  const userSettings = path.join(space.env.CLAUDE_CONFIG_DIR, 'settings.json');
  await fs.chmod(userSettings, 0o000);
  const result = await settings(space, ['show']);
  await fs.chmod(userSettings, 0o644);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^1\. specs = issues {2}\(project\)$/m);
  assert.match(result.stdout, /^2\. replies = tight {2}\(default\)$/m);
  assert.ok(result.stdout.includes(`${userSettings} could not be read (EACCES)`), result.stdout);
});

test('show marks the current option and names every layer the winner overrides', async () => {
  const space = await workspace({ local: { specs: 'both' }, project: { specs: 'issues' }, global: { specs: 'docs', interview: 'page' } });
  const result = await settings(space, ['show']);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^1\. specs = both {2}\(local\)$/m);
  assert.match(result.stdout, /^ {3}options: docs {2}issues {2}\[both\]$/m);
  assert.match(result.stdout, /^ {3}overrides: project=issues, global=docs$/m);
  assert.match(result.stdout, /^3\. interview = page {2}\(global, changed via \/config\)$/m);
  const longest = Math.max(...result.stdout.split('\n').map((line) => line.length));
  assert.ok(longest <= 76, `a line runs to ${longest} columns`);
});

test('menu asks for the setting, and with a key for a value other than the current one', async () => {
  const space = await workspace({ project: { specs: 'issues' } });
  const settingQuestion = await settings(space, ['menu']);
  assert.equal(settingQuestion.code, 0, settingQuestion.stderr);
  assert.ok(settingQuestion.stdout.trimEnd().endsWith('1. **specs**: change it, now issues\n2. **replies**: change it, now tight\n3. **interview**: change it, now chat\n4. **context**: change it, now 80\n5. **Keep**: change nothing'), settingQuestion.stdout);
  const valueQuestion = await settings(space, ['menu', 'specs']);
  assert.ok(valueQuestion.stdout.trimEnd().endsWith('1. **docs**: set specs to docs\n2. **both**: set specs to both\n3. **Keep issues**: change nothing'), valueQuestion.stdout);
  assert.doesNotMatch(valueQuestion.stdout, /replies/);
  const unknown = await settings(space, ['menu', 'wiki']);
  assert.equal(unknown.code, 1);
  assert.match(unknown.stderr, /unknown setting wiki/);
});

test('every schema key is a userConfig entry with the same type, options and default', async () => {
  const schema = JSON.parse(await fs.readFile(new URL('../skills/settings/schema.json', import.meta.url), 'utf8'));
  const plugin = JSON.parse(await fs.readFile(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'));
  const userConfig = plugin.userConfig ?? {};
  assert.deepEqual(Object.keys(userConfig).sort(), Object.keys(schema).sort());
  for (const [key, entry] of Object.entries(schema)) {
    assert.equal(userConfig[key].type, entry.type, key);
    assert.deepEqual(userConfig[key].options, entry.options, key);
    assert.equal(userConfig[key].default, entry.default, key);
  }
});

test('context is 80 by default and a whole number from any layer', async () => {
  assert.equal((await settings(await workspace(), ['get', 'context'])).stdout.trim(), '80');
  const project = await workspace({ project: { context: 120 } });
  assert.equal((await settings(project, ['get', 'context'])).stdout.trim(), '120');
  const stringGlobal = await workspace({ global: { context: '150' } });
  assert.equal((await settings(stringGlobal, ['get', 'context'])).stdout.trim(), '150');
  const hookGlobal = await settings(await workspace(), ['get', 'context'], { CLAUDE_PLUGIN_OPTION_CONTEXT: '60' });
  assert.equal(hookGlobal.stdout.trim(), '60');
});

test('a stored context that is not a whole number of at least 1 reads as the default', async () => {
  for (const stored of [0, 2.5, 'lots', -3]) {
    const space = await workspace({ project: { context: stored } });
    const result = await settings(space, ['get', 'context']);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.trim(), '80', String(stored));
  }
});

test('set writes context as a number and rejects anything but a whole number of at least 1', async () => {
  const space = await workspace();
  const written = await settings(space, ['set', 'context', '120', '--scope', 'project']);
  assert.equal(written.code, 0, written.stderr);
  assert.equal(written.stdout.split('\n')[0], 'context=120 set in .claude/exo.json');
  const stored = JSON.parse(await fs.readFile(path.join(space.root, '.claude', 'exo.json'), 'utf8'));
  assert.deepEqual(stored, { context: 120 });
  const zero = await settings(space, ['set', 'context', '0', '--scope', 'project']);
  assert.equal(zero.code, 1);
  assert.match(zero.stderr, /context=0 is not a whole number of at least 1/);
  const word = await settings(space, ['set', 'context', 'lots', '--scope', 'project']);
  assert.equal(word.code, 1);
  assert.match(word.stderr, /context=lots is not a number/);
});

test('show lists context with its layer and no options line', async () => {
  const result = await settings(await workspace({ local: { context: 100 } }), ['show']);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^4\. context = 100 {2}\(local\)$/m);
});
