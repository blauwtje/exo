// The secret guard denies a Bash read of a path that a `Read(...)` deny entry in
// the user or project settings protects, reads only the words a reader command
// opens, passes every other tool, and stands down when the guards setting is off.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const GUARD = fileURLToPath(new URL('../hooks/guards/secret-guard.mjs', import.meta.url));

async function writeSettings(file, deny) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ permissions: { deny } }));
}

// A home directory, a config directory and a project, each with its own
// settings file, so a rule from every source can be tried.
async function workspace({ user = [], project = [], local = [] } = {}) {
  const root = await fixture();
  const home = path.join(root, 'home');
  const config = path.join(home, '.claude');
  const projectDirectory = path.join(root, 'project');
  await writeSettings(path.join(config, 'settings.json'), user);
  await writeSettings(path.join(projectDirectory, '.claude', 'settings.json'), project);
  await writeSettings(path.join(projectDirectory, '.claude', 'settings.local.json'), local);
  return { home, config, projectDirectory };
}

async function guard(hookInput, place, { env = {}, input = JSON.stringify(hookInput) } = {}) {
  return run(GUARD, [], {
    cwd: place.projectDirectory,
    input,
    env: { HOME: place.home, CLAUDE_CONFIG_DIR: place.config, CLAUDE_PROJECT_DIR: place.projectDirectory, ...env }
  });
}

async function reason(command, place, options = {}) {
  const hookInput = { tool_name: 'Bash', cwd: options.cwd ?? place.projectDirectory, tool_input: { command } };
  const outcome = await guard(hookInput, place, options);
  assert.equal(outcome.code, 0, outcome.stderr);
  if (outcome.stdout === '') return null;
  const { hookSpecificOutput } = JSON.parse(outcome.stdout);
  assert.equal(hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(hookSpecificOutput.permissionDecision, 'deny');
  return hookSpecificOutput.permissionDecisionReason;
}

test('a reader of a path the project rules protect is denied and the reason names the rule', async () => {
  const place = await workspace({ project: ['Read(./.env)', 'Read(./secrets/**)', 'Read(**/*.pem)'] });
  for (const [command, rule] of [
    ['cat .env', 'Read(./.env)'],
    ['head -n 5 ./.env', 'Read(./.env)'],
    ['cat secrets/prod/token.txt', 'Read(./secrets/**)'],
    ['grep -r token secrets', 'Read(./secrets/**)'],
    ['sed -n 1,3p deploy/key.pem', 'Read(**/*.pem)'],
    ['cat secrets/../.env', 'Read(./.env)'],
    ['cp .env /tmp/copy', 'Read(./.env)']
  ]) {
    const denied = await reason(command, place);
    assert.match(denied, /^secret-guard:/, command);
    assert.ok(denied.includes(rule), `${command}: ${denied}`);
  }
});

test('the user settings file protects paths under the home directory in every spelling', async () => {
  const place = await workspace({ user: ['Read(~/.ssh/**)', 'Read(//etc/private/**)'] });
  for (const command of [
    'cat ~/.ssh/id_rsa',
    'cat $HOME/.ssh/id_rsa',
    'cat "${HOME}/.ssh/id_rsa"',
    `cat ${place.home}/.ssh/id_rsa`,
    'tail /etc/private/key',
    'grep -r BEGIN ~/.ssh'
  ]) {
    assert.match(await reason(command, place), /secret-guard/, command);
  }
});

test('the local settings file and a slash-rooted rule count, and a bare name matches at any depth', async () => {
  const place = await workspace({ local: ['Read(/config/keys.json)', 'Read(.npmrc)'] });
  assert.match(await reason('cat config/keys.json', place), /Read\(\/config\/keys\.json\)/);
  assert.match(await reason('cat packages/app/.npmrc', place), /Read\(\.npmrc\)/);
  assert.equal(await reason('cat other/keys.json', place), null);
});

test('a glob star stays inside one directory and a double star crosses them', async () => {
  const place = await workspace({ project: ['Read(./env/*)', 'Read(./vault/**)'] });
  assert.match(await reason('cat env/prod', place), /secret-guard/);
  assert.equal(await reason('cat env/prod/nested', place), null);
  assert.match(await reason('cat vault/a/b/c', place), /secret-guard/);
});

test('a relative rule resolves against the hook working directory', async () => {
  const place = await workspace({ project: ['Read(./.env)'] });
  const inside = path.join(place.projectDirectory, 'app');
  await fs.mkdir(inside, { recursive: true });
  assert.match(await reason('cat .env', place, { cwd: inside }), /secret-guard/);
  assert.equal(await reason('cat ../.env', place, { cwd: inside }), null);
});

test('a redirect from a protected file and a reader after a pipe, chain or substitution are denied', async () => {
  const place = await workspace({ project: ['Read(./.env)'] });
  for (const command of [
    'jq . < .env',
    'wc -l < .env; cat .env',
    'echo start && cat .env',
    'ls | cat .env',
    'echo "$(cat .env)"',
    'sudo cat .env',
    'LANG=C cat .env',
    "cat '.env'",
    'cat ".env"',
    'echo ok\ncat .env'
  ]) {
    assert.match(await reason(command, place), /secret-guard/, command);
  }
});

test('a search pattern that spells a protected path is denied like a file, because every operand counts', async () => {
  const place = await workspace({ project: ['Read(./.env)'] });
  assert.match(await reason('grep .env README.md', place), /secret-guard/);
});

test('a command that does not read the protected path passes', async () => {
  const place = await workspace({ project: ['Read(./.env)', 'Read(./secrets/**)'] });
  for (const command of [
    'cat README.md',
    'ls -a .env',
    'rm .env',
    'echo .env',
    'git add .env',
    'cat notes.txt > .env',
    'cat .env.example',
    'echo "cat .env"',
    'npm test'
  ]) {
    assert.equal(await reason(command, place), null, command);
  }
});

test('a settings file without Read deny entries protects nothing', async () => {
  const place = await workspace({ project: ['Bash(rm -rf:*)', 'Edit(./.env)', 42] });
  assert.equal(await reason('cat .env', place), null);
});

test('other tools and empty input pass', async () => {
  const place = await workspace({ project: ['Read(./.env)'] });
  const edit = await guard({ tool_name: 'Edit', tool_input: { command: 'cat .env' } }, place);
  assert.deepEqual([edit.code, edit.stdout], [0, '']);
  assert.equal(await reason('', place), null);
  const empty = await guard(null, place, { input: '' });
  assert.deepEqual([empty.code, empty.stdout], [0, '']);
});

test('the guards setting off stands the guard down', async () => {
  const place = await workspace({ project: ['Read(./.env)'] });
  assert.match(await reason('cat .env', place, { env: { CLAUDE_PLUGIN_OPTION_GUARDS: 'on' } }), /secret-guard/);
  assert.equal(await reason('cat .env', place, { env: { CLAUDE_PLUGIN_OPTION_GUARDS: 'off' } }), null);
});

test('a broken settings file is named on stderr, and another file still denies', async () => {
  const place = await workspace({ user: ['Read(~/.ssh/**)'] });
  await fs.writeFile(path.join(place.projectDirectory, '.claude', 'settings.json'), '{ broken');
  const quiet = await guard({ tool_name: 'Bash', tool_input: { command: 'cat README.md' } }, place);
  assert.equal(quiet.code, 1);
  assert.match(quiet.stderr, /secret-guard: cannot read the deny rules in .*settings\.json/);
  assert.equal(quiet.stdout, '');
  assert.match(await reason('cat ~/.ssh/id_rsa', place), /secret-guard/);
});

test('input that is not JSON is a non-blocking error with no decision', async () => {
  const place = await workspace();
  const broken = await guard(null, place, { input: '{ not json' });
  assert.equal(broken.code, 1);
  assert.match(broken.stderr, /secret-guard: cannot read the hook input/);
  assert.equal(broken.stdout, '');
});
