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
import { readFileSync } from 'node:fs';

const SCHEMA = JSON.parse(readFileSync(new URL('../skills/configure/schema.json', import.meta.url), 'utf8'));
const TIGHT_RULE = `. ${SCHEMA.replies.rules.tight}`;

const SETTINGS = fileURLToPath(new URL('../skills/configure/scripts/settings.mjs', import.meta.url));

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
  const env = { CLAUDE_PROJECT_DIR: root, CLAUDE_CONFIG_DIR: configDirectory, CLAUDE_PLUGIN_OPTION_SPECS: '', CLAUDE_PLUGIN_OPTION_REPLIES: '', CLAUDE_PLUGIN_OPTION_BUDGET: '', CLAUDE_PLUGIN_OPTION_SHIP: '', CLAUDE_PLUGIN_OPTION_WORKSPACE: '', CLAUDE_PLUGIN_OPTION_GUARDS: '' };
  return { root, env };
}

async function settings(space, args, extraEnv = {}) {
  return run(SETTINGS, args, { cwd: space.root, env: { ...space.env, ...extraEnv } });
}

test('with nothing set the schema default applies', async () => {
  const result = await settings(await workspace(), ['context']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'exo settings: specs=docs (default), replies=tight (default), budget=medium (default), ship=ask (default), workspace=ask (default), guards=on (default), guard_lines=400 (default)' + TIGHT_RULE);
});

test('local outranks project, which outranks global', async () => {
  const layered = await workspace({ project: { specs: 'issues' }, local: { specs: 'both' }, global: { specs: 'docs' } });
  assert.equal((await settings(layered, ['get', 'specs'])).stdout.trim(), 'both');
  const shared = await workspace({ project: { specs: 'issues' }, global: { specs: 'both' } });
  assert.equal((await settings(shared, ['context'])).stdout.trim(), 'exo settings: specs=issues (project), replies=tight (default), budget=medium (default), ship=ask (default), workspace=ask (default), guards=on (default), guard_lines=400 (default)' + TIGHT_RULE);
  const globalOnly = await workspace({ global: { specs: 'both' } });
  assert.equal((await settings(globalOnly, ['context'])).stdout.trim(), 'exo settings: specs=both (global), replies=tight (default), budget=medium (default), ship=ask (default), workspace=ask (default), guards=on (default), guard_lines=400 (default)' + TIGHT_RULE);
});

test('the hook environment carries the global value when it is set', async () => {
  const space = await workspace({ global: { specs: 'docs' } });
  const result = await settings(space, ['context'], { CLAUDE_PLUGIN_OPTION_SPECS: 'issues' });
  assert.equal(result.stdout.trim(), 'exo settings: specs=issues (global), replies=tight (default), budget=medium (default), ship=ask (default), workspace=ask (default), guards=on (default), guard_lines=400 (default)' + TIGHT_RULE);
});

test('replies is tight by default and standard when the project sets it', async () => {
  const unset = await workspace();
  assert.equal((await settings(unset, ['get', 'replies'])).stdout.trim(), 'tight');
  const project = await workspace({ project: { replies: 'standard' } });
  assert.equal((await settings(project, ['get', 'replies'])).stdout.trim(), 'standard');
});

test('replies=terse injects the terse rule in place of the tight one', async () => {
  const space = await workspace({ project: { replies: 'terse' } });
  const result = await settings(space, ['context']);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /replies=terse \(project\)/);
  assert.ok(result.stdout.trim().endsWith(`. ${SCHEMA.replies.rules.terse}`), result.stdout);
  assert.ok(!result.stdout.includes(SCHEMA.replies.rules.tight), result.stdout);
  assert.ok(!SCHEMA.replies.rules.terse.includes('where the meaning survives'));
  assert.ok(SCHEMA.replies.rules.terse.includes('never write a, an or the'));
  assert.ok(SCHEMA.replies.rules.terse.includes('never write is, are, was or were'));
  assert.ok(!SCHEMA.replies.rules.terse.includes('steps whose order matters'));
  assert.match(SCHEMA.replies.rules.terse, /label such as .Warning:. on anything else does not lift the ban/);
  assert.ok(SCHEMA.replies.rules.terse.includes('Hook not reading setting → reminder never fires.'));
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
  assert.match(result.stdout, /^exo settings: specs=docs \(default\), replies=tight \(default\), budget=medium \(default\), ship=ask \(default\), workspace=ask \(default\), guards=on \(default\), guard_lines=400 \(default\); .*exo\.json is not valid JSON/);
});

test('a value the schema does not allow is named in the context line, and the default replies rule still applies', async () => {
  const space = await workspace({ project: { replies: 'verbose' } });
  const result = await settings(space, ['context']);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /replies=tight \(default\).*replies=verbose is not one of terse, tight, standard/);
  assert.ok(result.stdout.trim().endsWith(TIGHT_RULE), result.stdout);
});

test('an unreadable user settings file still shows the other layers and names the file', { skip: process.getuid?.() === 0 }, async () => {
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
  const space = await workspace({ local: { specs: 'both' }, project: { specs: 'issues' }, global: { specs: 'docs', replies: 'standard', interview: 'page' } });
  const result = await settings(space, ['show']);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^1\. specs = both {2}\(local\)$/m);
  assert.match(result.stdout, /^ {3}options: docs {2}issues {2}\[both\]$/m);
  assert.match(result.stdout, /^ {3}overrides: project=issues, global=docs$/m);
  assert.match(result.stdout, /^2\. replies = standard {2}\(global, changed via \/config\)$/m);
  assert.doesNotMatch(result.stdout, /interview/, 'a key the schema no longer names is ignored');
  const longest = Math.max(...result.stdout.split('\n').map((line) => line.length));
  assert.ok(longest <= 76, `a line runs to ${longest} columns`);
});

test('menu asks for the setting, and with a key for a value other than the current one', async () => {
  const space = await workspace({ project: { specs: 'issues' } });
  const settingQuestion = await settings(space, ['menu']);
  assert.equal(settingQuestion.code, 0, settingQuestion.stderr);
  assert.ok(settingQuestion.stdout.trimEnd().endsWith('1. **specs**: change it, now issues\n2. **replies**: change it, now tight\n3. **budget**: change it, now medium\n4. **ship**: change it, now ask\n5. **workspace**: change it, now ask\n6. **guards**: change it, now on\n7. **guard_lines**: change it, now 400\n8. **Keep**: change nothing'), settingQuestion.stdout);
  const valueQuestion = await settings(space, ['menu', 'specs']);
  assert.ok(valueQuestion.stdout.trimEnd().endsWith('1. **docs**: set specs to docs\n2. **both**: set specs to both\n3. **Keep issues**: change nothing'), valueQuestion.stdout);
  assert.doesNotMatch(valueQuestion.stdout, /replies/);
  const unknown = await settings(space, ['menu', 'wiki']);
  assert.equal(unknown.code, 1);
  assert.match(unknown.stderr, /unknown setting wiki/);
});

test('every schema key is a userConfig entry with the same type, options and default', async () => {
  const schema = JSON.parse(await fs.readFile(new URL('../skills/configure/schema.json', import.meta.url), 'utf8'));
  const plugin = JSON.parse(await fs.readFile(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'));
  const userConfig = plugin.userConfig ?? {};
  assert.deepEqual(Object.keys(userConfig).sort(), Object.keys(schema).sort());
  for (const [key, entry] of Object.entries(schema)) {
    assert.equal(userConfig[key].type, entry.type, key);
    assert.deepEqual(userConfig[key].options, entry.options, key);
    assert.equal(userConfig[key].default, entry.default, key);
  }
});

// A copy of the plugin files settings.mjs imports, with the provider's tiers
// replaced, so a test can change a tier without touching the live table.
async function pluginWithTiers(tiers) {
  const copy = await fixture();
  const source = fileURLToPath(new URL('..', import.meta.url));
  await fs.cp(path.join(source, 'package.json'), path.join(copy, 'package.json'));
  await fs.cp(path.join(source, 'lib'), path.join(copy, 'lib'), { recursive: true });
  await fs.cp(path.join(source, 'skills', 'configure'), path.join(copy, 'skills', 'configure'), { recursive: true });
  const tablePath = path.join(copy, 'lib', 'model-kinds.json');
  const table = JSON.parse(readFileSync(tablePath, 'utf8'));
  const provider = table.providers[table.provider];
  provider.models = [...provider.models, ...Object.values(tiers)];
  Object.assign(provider.tiers, tiers);
  await writeJson(tablePath, table);
  return path.join(copy, 'skills', 'configure', 'scripts', 'settings.mjs');
}

test('the low rule names the provider models the kind table maps, and carries no placeholder', async () => {
  const table = JSON.parse(readFileSync(new URL('../lib/model-kinds.json', import.meta.url), 'utf8'));
  const [[fromTier, toTier]] = Object.entries(table.budgets.low);
  const script = await pluginWithTiers({ [fromTier]: 'model-from', [toTier]: 'model-to' });
  const space = await workspace({ project: { budget: 'low' } });
  const result = await run(script, ['context'], { cwd: space.root, env: space.env });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /budget=low \(project\)/);
  assert.ok(result.stdout.includes('resolves to model model-from ('), result.stdout);
  assert.ok(result.stdout.includes("pass model-to as the Task call's own model parameter"), result.stdout);
  assert.ok(result.stdout.includes('exo:solve-hard-low'), result.stdout);
  assert.doesNotMatch(result.stdout, /\{from\}|\{to\}/);
});

test('the high rule names both twins and carries no placeholder', async () => {
  const space = await workspace({ project: { budget: 'high' } });
  const result = await run(SETTINGS, ['context'], { cwd: space.root, env: space.env });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /budget=high \(project\)/);
  assert.ok(result.stdout.includes('exo:review-branch-deep-high'), result.stdout);
  assert.ok(result.stdout.includes('exo:critique-ui-high'), result.stdout);
  assert.ok(result.stdout.includes('exo:solve-hard-high'), result.stdout);
  assert.doesNotMatch(result.stdout, /\{from\}|\{to\}/);
});

test('the low rule text holds no model name of any provider', () => {
  const table = JSON.parse(readFileSync(new URL('../lib/model-kinds.json', import.meta.url), 'utf8'));
  const models = Object.values(table.providers).flatMap((provider) => provider.models);
  for (const model of models) {
    assert.ok(!SCHEMA.budget.rules.low.includes(model), model);
    assert.ok(!SCHEMA.budget.description.includes(model), model);
  }
});

test('guards is on by default and off when the project sets it', async () => {
  const unset = await workspace();
  assert.equal((await settings(unset, ['get', 'guards'])).stdout.trim(), 'on');
  const project = await workspace({ project: { guards: 'off' } });
  assert.equal((await settings(project, ['get', 'guards'])).stdout.trim(), 'off');
  const rejected = await settings(unset, ['set', 'guards', 'maybe', '--scope', 'project']);
  assert.notEqual(rejected.code, 0);
  assert.match(rejected.stderr, /guards=maybe is not one of on, off/);
});

test('a stored old budget name reads as its new level', async () => {
  for (const [old, level] of Object.entries(SCHEMA.budget.aliases)) {
    const space = await workspace({ project: { budget: old } });
    const result = await run(SETTINGS, ['get', 'budget'], { cwd: space.root, env: space.env });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.trim(), level);
  }
});
