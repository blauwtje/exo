// hooks.json names only scripts the plugin ships, and runs the SessionStart
// hook under bash on every session start, so a host without Git Bash does not
// fall back to PowerShell and a resumed session gets a current pointer.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));
const HOOKS = JSON.parse(fs.readFileSync(path.join(REPOSITORY, 'hooks', 'hooks.json'), 'utf8')).hooks;
const PLUGIN_PATH = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\s]+)/g;

function hookEntries() {
  const entries = [];
  for (const [event, groups] of Object.entries(HOOKS)) {
    for (const group of groups) {
      for (const hook of group.hooks) entries.push({ event, matcher: group.matcher, hook });
    }
  }
  return entries;
}

test('every hook command resolves under the plugin root to a file the repository ships', () => {
  const entries = hookEntries();
  assert.ok(entries.length >= 4, `${entries.length} hook commands`);
  for (const { event, hook } of entries) {
    const relativePaths = [...hook.command.matchAll(PLUGIN_PATH)].map((match) => match[1]);
    assert.ok(relativePaths.length > 0, `${event}: ${hook.command} names no plugin path`);
    for (const relative of relativePaths) {
      const target = path.join(REPOSITORY, relative);
      assert.ok(fs.existsSync(target) && fs.statSync(target).isFile(), `${event}: ${relative} does not exist`);
    }
  }
});

test('the SessionStart hook runs under bash on startup, resume, clear and compact', () => {
  const sessionStart = hookEntries().filter((entry) => entry.event === 'SessionStart');
  assert.equal(sessionStart.length, 1);
  assert.equal(sessionStart[0].hook.shell, 'bash');
  assert.deepEqual(sessionStart[0].matcher.split('|').sort(), ['clear', 'compact', 'resume', 'startup']);
});

test('the repeat guard runs on Bash and Edit before the tool call', () => {
  const guards = hookEntries().filter((entry) => entry.event === 'PreToolUse' && entry.hook.command.includes('repeat-guard.mjs'));
  assert.equal(guards.length, 1);
  assert.deepEqual(guards[0].matcher.split('|').sort(), ['Bash', 'Edit']);
});

test('routing opens on a prompt, names the skill that fired, and closes on Stop', () => {
  const routing = hookEntries().filter((entry) => entry.hook.command.includes('routing.mjs'));
  const wiring = routing.map((entry) => [entry.event, entry.matcher ?? null, entry.hook.command.split(' ').pop()]).sort();
  assert.deepEqual(wiring, [
    ['PreToolUse', 'Skill', 'fired'],
    ['Stop', null, 'close'],
    ['UserPromptSubmit', null, 'open']
  ]);
});

test('the restatement runs on every prompt and takes no matcher', () => {
  const restatement = hookEntries().filter((entry) => entry.hook.command.includes('restate.mjs'));
  assert.equal(restatement.length, 1);
  assert.equal(restatement[0].event, 'UserPromptSubmit');
  assert.equal(restatement[0].matcher, undefined);
  assert.ok(restatement[0].hook.command.endsWith('restate.mjs"'), restatement[0].hook.command);
});

test('the session hook points at a memory file only where one exists', () => {
  const hook = fs.readFileSync(path.join(REPOSITORY, 'hooks', 'session-start.sh'), 'utf8');
  assert.match(hook, /--git-common-dir/, 'the memory pointer does not resolve the common git directory');
  assert.match(hook, /if \[ -f "\$memory_file" \]/, 'the memory pointer is added without testing for the file');
  assert.match(hook, /A project memory for/, 'the memory pointer sentence is missing');
});
