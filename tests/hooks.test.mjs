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

test('the repeat guard counts Bash and Edit before the call and starts over after an Edit or Write', () => {
  const guards = hookEntries().filter((entry) => entry.hook.command.includes('repeat-guard.mjs'));
  const wiring = guards.map((entry) => [entry.event, entry.matcher.split('|').sort().join('|'), entry.hook.command.split(' ').pop()]).sort();
  assert.deepEqual(wiring, [
    ['PostToolUse', 'Edit|Write', 'edited'],
    ['PreToolUse', 'Bash|Edit|WebFetch|WebSearch', '"${CLAUDE_PLUGIN_ROOT}/skills/show-savings/scripts/repeat-guard.mjs"']
  ]);
});

test('the delegate budget runs before every tool call and after no call', () => {
  const budgets = hookEntries().filter((entry) => entry.hook.command.includes('delegate-budget.mjs'));
  assert.deepEqual(budgets.map((entry) => [entry.event, entry.matcher]), [['PreToolUse', '*']]);
});

test('the Stop hooks book the turn, keep a running plan going and check build-change proof, and nothing else', () => {
  const stop = hookEntries().filter((entry) => entry.event === 'Stop');
  assert.equal(stop.length, 3, JSON.stringify(stop.map((entry) => entry.hook.command)));
  assert.ok(stop[0].hook.command.endsWith('savings.mjs" record'), stop[0].hook.command);
  assert.ok(stop[1].hook.command.endsWith('resume-plan.mjs" stop'), stop[1].hook.command);
  assert.ok(stop[2].hook.command.endsWith('proof-check.mjs" stop'), stop[2].hook.command);
});

test('the restatement runs on every prompt and takes no matcher', () => {
  const restatement = hookEntries().filter((entry) => entry.hook.command.includes('restate.mjs'));
  assert.equal(restatement.length, 1);
  assert.equal(restatement[0].event, 'UserPromptSubmit');
  assert.equal(restatement[0].matcher, undefined);
  assert.ok(restatement[0].hook.command.endsWith('restate.mjs"'), restatement[0].hook.command);
});

test('the memory nudge runs on every prompt and approves its own booking before a Bash call', () => {
  const nudges = hookEntries().filter((entry) => entry.hook.command.includes('nudge.mjs'));
  const wiring = nudges.map((entry) => [entry.event, entry.matcher ?? null, entry.hook.command.split(' ').pop()]).sort();
  assert.deepEqual(wiring, [
    ['PreToolUse', 'Bash', 'approve'],
    ['UserPromptSubmit', null, '"${CLAUDE_PLUGIN_ROOT}/skills/remember/scripts/nudge.mjs"']
  ]);
});

test('the session hook points at a memory file only where one exists', () => {
  const hook = fs.readFileSync(path.join(REPOSITORY, 'hooks', 'session-start.sh'), 'utf8');
  assert.match(hook, /--git-common-dir/, 'the memory pointer does not resolve the common git directory');
  assert.match(hook, /if \[ -f "\$memory_file" \]/, 'the memory pointer is added without testing for the file');
  assert.match(hook, /A project memory for/, 'the memory pointer sentence is missing');
});

test('the context watch runs before every tool inside the delegate budget hook and has no hook of its own', () => {
  const watch = hookEntries().filter((entry) => entry.hook.command.includes('context-watch.mjs'));
  assert.deepEqual(watch, []);
  const everyTool = hookEntries().filter((entry) => entry.event === 'PreToolUse' && entry.matcher === '*');
  assert.equal(everyTool.length, 1);
  assert.ok(everyTool[0].hook.command.endsWith('delegate-budget.mjs"'), everyTool[0].hook.command);
  const budget = fs.readFileSync(path.join(REPOSITORY, 'skills', 'show-savings', 'scripts', 'delegate-budget.mjs'), 'utf8');
  assert.match(budget, /import\('\.\/context-watch\.mjs'\)/);
});

test('every shipped guard runs before Bash calls under bash, and the writing guard also before Edit and Write', () => {
  const guardFiles = fs.readdirSync(path.join(REPOSITORY, 'hooks', 'guards')).filter((name) => name.endsWith('-guard.mjs'));
  assert.deepEqual(guardFiles.sort(), [
    'bash-output-guard.mjs', 'destructive-guard.mjs', 'detach-guard.mjs', 'git-guard.mjs', 'secret-guard.mjs', 'writing-guard.mjs'
  ]);
  for (const guardFile of guardFiles) {
    const registered = hookEntries().filter((entry) => entry.hook.command.includes(`hooks/guards/${guardFile}"`));
    assert.equal(registered.length, 1, `${guardFile} is registered ${registered.length} times`);
    assert.equal(registered[0].event, 'PreToolUse', guardFile);
    assert.equal(registered[0].hook.shell, 'bash', guardFile);
    const expectedMatcher = guardFile === 'writing-guard.mjs' ? 'Bash|Edit|Write' : 'Bash';
    assert.equal(registered[0].matcher, expectedMatcher, guardFile);
  }
});

test('the reply expander runs under bash on every prompt and takes no matcher', () => {
  const expander = hookEntries().filter((entry) => entry.hook.command.includes('expand-reply.mjs'));
  assert.equal(expander.length, 1);
  assert.equal(expander[0].event, 'UserPromptSubmit');
  assert.equal(expander[0].matcher, undefined);
  assert.equal(expander[0].hook.shell, 'bash');
  assert.ok(expander[0].hook.command.endsWith('skills/configure/scripts/expand-reply.mjs"'), expander[0].hook.command);
});
