// The Codex hook entries come from an allowlist over hooks/hooks.json, carry
// only documented handler fields, and run codex/hook-entry.mjs, which fixes the
// host and root, refuses an unlisted script and keeps a hostile root as data.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { codexHookEntries, codexHookTargets, DOCUMENTED_FIELDS } from '../codex/hooks.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const TARGETS = ['hooks/session-start.mjs', 'hooks/dispatch-prompt.mjs', 'hooks/dispatch-bash.mjs', 'hooks/record-runtime.mjs'];

function handlersOf(entries) {
  return Object.values(entries).flatMap((groups) => groups.flatMap((group) => group.hooks));
}

// A root of stub scripts, so the test sees what the wrapper hands the script.
function stubRoot(name) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hooks-'));
  const root = path.join(base, name);
  fs.mkdirSync(path.join(root, 'codex'), { recursive: true });
  fs.mkdirSync(path.join(root, 'hooks'), { recursive: true });
  for (const file of ['hook-entry.mjs', 'hooks.mjs']) fs.copyFileSync(path.join(ROOT, 'codex', file), path.join(root, 'codex', file));
  fs.copyFileSync(path.join(ROOT, 'hooks', 'hooks.json'), path.join(root, 'hooks', 'hooks.json'));
  const stub = [
    "import process from 'node:process';",
    'process.stdout.write(JSON.stringify({ host: process.env.EXO_HOST, root: process.env.CLAUDE_PLUGIN_ROOT, entry: process.argv[1], extra: process.argv.length }));'
  ].join('\n');
  for (const target of TARGETS) fs.writeFileSync(path.join(root, target), stub);
  fs.writeFileSync(path.join(root, 'hooks', 'hooks.mjs'), stub);
  return { base, root };
}

function runCommand(command, env = {}) {
  return spawnSync('/bin/sh', ['-c', command], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });
}

test('the entries list exactly the allowlisted events and matchers', () => {
  const entries = codexHookEntries(ROOT);
  assert.deepEqual(Object.keys(entries), ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse']);
  assert.equal(entries.SessionStart[0].matcher, 'startup|resume|clear|compact');
  assert.equal(entries.UserPromptSubmit[0].matcher, undefined);
  assert.deepEqual(entries.PreToolUse.map((group) => group.matcher), ['Bash']);
  assert.deepEqual(entries.PostToolUse.map((group) => group.matcher), ['Bash']);
  assert.deepEqual(codexHookTargets(ROOT), TARGETS);
});

test('an entry carries only documented handler fields and never shell', () => {
  const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks', 'hooks.json'), 'utf8'));
  assert.ok(JSON.stringify(source).includes('"shell"'), 'the source entries still hold shell');
  const handlers = handlersOf(codexHookEntries(ROOT));
  assert.equal(handlers.length, 4);
  for (const handler of handlers) {
    assert.deepEqual(Object.keys(handler).filter((field) => !DOCUMENTED_FIELDS.includes(field)), []);
    assert.equal(handler.type, 'command');
    assert.equal(handler.shell, undefined);
    assert.equal(typeof handler.timeout, 'number');
  }
});

test('the session entry raises the token limit and no other entry sets one', () => {
  const entries = codexHookEntries(ROOT);
  assert.equal(entries.SessionStart[0].hooks[0].additionalContextLimit, 6000);
  const others = handlersOf({ ...entries, SessionStart: [] });
  assert.deepEqual(others.filter((handler) => 'additionalContextLimit' in handler), []);
});

test('every command runs the wrapper with a listed script', () => {
  const handlers = handlersOf(codexHookEntries(ROOT));
  const wrapper = path.join(ROOT, 'codex', 'hook-entry.mjs');
  assert.deepEqual(handlers.map((handler) => handler.command), TARGETS.map((target) => `node '${wrapper}' ${target}`));
  assert.deepEqual(handlers.map((handler) => handler.commandWindows), TARGETS.map((target) => `node "${wrapper}" ${target}`));
});

test('a root with a space, quote or shell syntax stays data (injection)', () => {
  const hostile = "sp ace's \"q\" $(touch pwned) `touch pwned2`; touch pwned3 #";
  const { base, root } = stubRoot(hostile);
  for (const handler of handlersOf(codexHookEntries(root))) {
    const run = runCommand(handler.command, { CLAUDE_PLUGIN_ROOT: '/elsewhere' });
    assert.equal(run.status, 0, run.stderr);
    const seen = JSON.parse(run.stdout);
    assert.equal(seen.root, fs.realpathSync(root));
    assert.equal(seen.host, 'codex');
  }
  assert.deepEqual(fs.readdirSync(base), [hostile]);
  for (const name of ['pwned', 'pwned2', 'pwned3']) assert.equal(fs.existsSync(path.join(process.cwd(), name)), false);
  assert.equal(fs.readdirSync(root).includes('pwned'), false);
});

test('a root Windows cannot quote gets no commandWindows entry', () => {
  for (const unsafe of ['a"b', 'a%PATH%', 'a$HOME', 'a`b', 'a&b']) {
    const { root } = stubRoot(unsafe);
    for (const handler of handlersOf(codexHookEntries(root))) {
      assert.equal(handler.commandWindows, undefined, unsafe);
      assert.equal(runCommand(handler.command).status, 0, unsafe);
    }
  }
});

test('the wrapper sets the host and the root over inherited values and passes the script no arguments', () => {
  const { root } = stubRoot('plain');
  const run = runCommand(`node '${path.join(root, 'codex', 'hook-entry.mjs')}' hooks/dispatch-bash.mjs`, { EXO_HOST: 'claude', CLAUDE_PLUGIN_ROOT: '/elsewhere', CLAUDECODE: '1' });
  assert.equal(run.status, 0, run.stderr);
  const seen = JSON.parse(run.stdout);
  assert.equal(seen.host, 'codex');
  assert.equal(seen.root, fs.realpathSync(root));
  assert.equal(seen.entry, path.join(fs.realpathSync(root), 'hooks', 'dispatch-bash.mjs'));
  assert.equal(seen.extra, 2);
});

test('the wrapper refuses an unlisted script before running anything (trust boundary)', () => {
  const { root } = stubRoot('plain');
  const wrapper = path.join(root, 'codex', 'hook-entry.mjs');
  const refused = ['hooks/hooks.mjs', 'hooks/hooks.json', 'hooks/guards/read-guard.mjs', '../hooks/session-start.mjs', 'hooks/../hooks/hooks.mjs', path.join(root, 'hooks', 'dispatch-bash.mjs'), '/etc/passwd', ''];
  for (const target of refused) {
    const run = spawnSync('node', [wrapper, target], { encoding: 'utf8' });
    assert.equal(run.status, 1, target);
    assert.equal(run.stdout, '', target);
    assert.match(run.stderr, /refused/, target);
  }
  const bare = spawnSync('node', [wrapper], { encoding: 'utf8' });
  assert.equal(bare.status, 1);
  assert.equal(bare.stdout, '');
  const extra = spawnSync('node', [wrapper, 'hooks/dispatch-bash.mjs', 'hooks/hooks.mjs'], { encoding: 'utf8' });
  assert.equal(extra.status, 1);
  assert.equal(extra.stdout, '');
});

test('the wrapper fails closed when the source hooks file does not parse', () => {
  const { root } = stubRoot('plain');
  fs.writeFileSync(path.join(root, 'hooks', 'hooks.json'), '{ not json');
  const run = spawnSync('node', [path.join(root, 'codex', 'hook-entry.mjs'), 'hooks/dispatch-bash.mjs'], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.equal(run.stdout, '');
});

test('the real bash dispatcher runs through the wrapper as a Codex hook and denies', () => {
  const handler = codexHookEntries(ROOT).PreToolUse[0].hooks[0];
  const input = { session_id: 's', cwd: os.tmpdir(), hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'docker volume rm data' } };
  const run = spawnSync('/bin/sh', ['-c', handler.command], { encoding: 'utf8', input: JSON.stringify(input), env: { PATH: process.env.PATH, HOME: os.tmpdir(), CLAUDE_CONFIG_DIR: os.tmpdir(), CLAUDE_PROJECT_DIR: os.tmpdir() } });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).hookSpecificOutput.permissionDecision, 'deny');
});
