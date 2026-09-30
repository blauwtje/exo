// The destructive guard denies a Bash command that deletes a container, volume,
// database or credential, reads command words from the blanked command and
// arguments from the raw one, passes every other tool, and stands down when the
// guards setting is off.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const GUARD = fileURLToPath(new URL('../hooks/guards/destructive-guard.mjs', import.meta.url));

async function guard(hookInput, { env = {}, input = JSON.stringify(hookInput) } = {}) {
  const directory = await fixture();
  return run(GUARD, [], {
    cwd: directory,
    input,
    env: { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: directory, ...env }
  });
}

async function reason(command, options) {
  const outcome = await guard({ tool_name: 'Bash', tool_input: { command } }, options);
  assert.equal(outcome.code, 0, outcome.stderr);
  if (outcome.stdout === '') return null;
  const { hookSpecificOutput } = JSON.parse(outcome.stdout);
  assert.equal(hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(hookSpecificOutput.permissionDecision, 'deny');
  return hookSpecificOutput.permissionDecisionReason;
}

async function assertDenied(commands, pattern) {
  for (const command of commands) {
    assert.match(await reason(command), pattern, command);
  }
}

async function assertAllowed(commands) {
  for (const command of commands) {
    assert.equal(await reason(command), null, command);
  }
}

test('removing a container, a volume or the machine-wide leftovers is denied', async () => {
  await assertDenied([
    'docker rm web',
    'docker container rm -f web',
    'podman rm web',
    'docker compose rm -sf',
    'cd app && docker rm web',
    'sudo docker rm web'
  ], /destructive-guard.*container/);
  await assertDenied(['docker volume rm data', 'podman volume prune -f'], /destructive-guard.*volume/);
  await assertDenied(['docker system prune -af', 'docker container prune'], /destructive-guard.*prune/);
});

test('compose down is denied only with --volumes', async () => {
  await assertDenied([
    'docker compose down -v',
    'docker-compose down --volumes',
    'podman-compose down -v'
  ], /destructive-guard.*volumes/);
  await assertAllowed(['docker compose down', 'docker stop web', 'docker rmi image', 'docker ps -a']);
});

test('deleting a namespace, a claim or --all in kubectl is denied and a pod delete passes', async () => {
  await assertDenied([
    'kubectl delete namespace prod',
    'kubectl -n prod delete pvc data',
    'kubectl delete ns staging',
    'kubectl delete pods --all'
  ], /destructive-guard.*namespace/);
  await assertAllowed(['kubectl delete pod web-1', 'kubectl delete deployment web', 'kubectl get pvc']);
});

test('dropping or truncating in SQL is denied, from a quoted argument or a heredoc', async () => {
  await assertDenied([
    'psql -c "DROP TABLE users"',
    "mysql -e 'drop database shop'",
    'sqlite3 app.db "drop table t"',
    'psql -c "select 1; drop schema public"',
    'psql <<EOF\ndrop table users\nEOF'
  ], /destructive-guard.*(dropping|drop)/i);
  await assertDenied(['psql -c "TRUNCATE TABLE users"', 'psql -c "truncate users"'], /TRUNCATE/);
});

test('SQL words in a read-only command or a commit message pass', async () => {
  await assertAllowed([
    'grep -rn "drop table" migrations',
    'echo "drop table users"',
    'git commit -m "docs: never drop table users"',
    'psql -c "select * from drop_table_log"',
    'psql -c "select 1; select 2"'
  ]);
});

test('database drop commands and database files are denied', async () => {
  await assertDenied(['dropdb shop', 'mysqladmin -u root drop shop', 'npx prisma migrate reset --force', 'npx drizzle-kit drop', 'rails db:drop'],
    /destructive-guard.*(database|drops)/);
  await assertDenied(['rm app.db', 'rm -f data/app.sqlite3', 'rm "my data.sqlite"'], /destructive-guard.*database file/);
  await assertAllowed(['rm app.log', 'ls app.db', 'rm dbfile.txt']);
});

test('deleting a credential file, a keychain entry or a login is denied', async () => {
  await assertDenied([
    'rm ~/.ssh/id_rsa',
    'rm -rf ~/.aws/',
    'rm ~/.config/gh/hosts.yml',
    'rm .env',
    'rm -f .env.production',
    'rm cert.pem',
    'rm "server.key"',
    'rm ~/.netrc',
    'rm ~/.git-credentials'
  ], /destructive-guard.*credential file/);
  await assertDenied(['security delete-generic-password -s x', 'security delete-keychain login'], /keychain/);
  await assertDenied(['gh auth logout'], /gh auth logout/);
  await assertDenied(['chezmoi destroy ~/.zshrc', 'chezmoi forget ~/.zshrc'], /chezmoi/);
  await assertAllowed(['cat .env', 'rm .environment-notes', 'rm keyboard.txt', 'gh auth status']);
});

test('a command word in quoted text or a heredoc body is not a command', async () => {
  await assertAllowed([
    'echo "docker rm web"',
    "echo 'gh auth logout'",
    'git commit -m "fix: rm .env and docker volume rm"',
    'cat <<EOF\ndocker system prune\nEOF'
  ]);
});

test('an operator inside a quoted string does not split a command', async () => {
  await assertDenied(['psql -c "select 1; drop table t"', 'echo ok && docker volume rm data'], /destructive-guard/);
  await assertAllowed(['echo "a; docker rm web"']);
});

test('a substitution inside a double-quoted string still runs', async () => {
  await assertDenied(['echo "$(docker rm web)"'], /destructive-guard.*container/);
});

test('other tools and empty input pass', async () => {
  const edit = await guard({ tool_name: 'Edit', tool_input: { command: 'docker rm web' } });
  assert.deepEqual([edit.code, edit.stdout], [0, '']);
  assert.equal(await reason(''), null);
  const empty = await guard(null, { input: '' });
  assert.deepEqual([empty.code, empty.stdout], [0, '']);
});

test('the guards setting off stands the guard down', async () => {
  const command = 'docker volume rm data';
  assert.match(await reason(command, { env: { CLAUDE_PLUGIN_OPTION_GUARDS: 'on' } }), /destructive-guard/);
  assert.equal(await reason(command, { env: { CLAUDE_PLUGIN_OPTION_GUARDS: 'off' } }), null);
});

test('an unreadable settings file leaves the guard on', async () => {
  const directory = await fixture();
  await fs.mkdir(path.join(directory, '.claude'));
  await fs.writeFile(path.join(directory, '.claude', 'exo.json'), '{ broken');
  const outcome = await run(GUARD, [], {
    cwd: directory,
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'docker volume rm data' } }),
    env: { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: directory }
  });
  assert.match(outcome.stdout, /destructive-guard/);
});

test('input that is not JSON exits 0 with no output', async () => {
  const broken = await guard(null, { input: '{ not json' });
  assert.deepEqual([broken.code, broken.stdout, broken.stderr], [0, '', '']);
});
