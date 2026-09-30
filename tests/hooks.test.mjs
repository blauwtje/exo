// hooks.json names only scripts the plugin ships, and runs the SessionStart
// hook under bash on every session start, so a host without Git Bash does not
// fall back to PowerShell and a resumed session gets a current pointer.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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

test('the repeat guard counts Edit and the web tools before the call and starts over after an Edit or Write', () => {
  const guards = hookEntries().filter((entry) => entry.hook.command.includes('repeat-guard.mjs'));
  const wiring = guards.map((entry) => [entry.event, entry.matcher.split('|').sort().join('|'), entry.hook.command.split(' ').pop()]).sort();
  assert.deepEqual(wiring, [
    ['PostToolUse', 'Edit|Write', 'edited'],
    ['PreToolUse', 'Edit|WebFetch|WebSearch', '"${CLAUDE_PLUGIN_ROOT}/hooks/guards/repeat-guard.mjs"']
  ]);
});

test('the delegate budget runs before every tool call and after no call', () => {
  const budgets = hookEntries().filter((entry) => entry.hook.command.includes('delegate-budget.mjs'));
  assert.deepEqual(budgets.map((entry) => [entry.event, entry.matcher]), [['PreToolUse', '^(?!Bash$).*']]);
  const bashDispatcher = fs.readFileSync(path.join(REPOSITORY, 'hooks', 'dispatch-bash.mjs'), 'utf8');
  assert.match(bashDispatcher, /name: 'delegate-budget'/, 'the Bash dispatcher does not run the delegate budget');
  const matcher = new RegExp(budgets[0].matcher);
  assert.equal(matcher.test('Bash'), false);
  for (const tool of ['Read', 'Edit', 'Write', 'Task', 'Agent', 'BashOutput', 'mcp__server__Bash', 'TaskUpdate']) assert.equal(matcher.test(tool), true, tool);
});

test('one Stop hook runs the dispatcher that books the turn, keeps a plan going, checks build-change proof and scores terse replies', () => {
  const stop = hookEntries().filter((entry) => entry.event === 'Stop');
  assert.equal(stop.length, 1, JSON.stringify(stop.map((entry) => entry.hook.command)));
  assert.equal(stop[0].matcher, undefined);
  assert.ok(stop[0].hook.command.endsWith('hooks/dispatch-stop.mjs"'), stop[0].hook.command);
});

test('one prompt hook runs the dispatcher for the memory nudge and the reply expander, and takes no matcher', () => {
  const prompt = hookEntries().filter((entry) => entry.event === 'UserPromptSubmit');
  assert.equal(prompt.length, 1, JSON.stringify(prompt.map((entry) => entry.hook.command)));
  assert.equal(prompt[0].matcher, undefined);
  assert.equal(prompt[0].hook.shell, 'bash');
  assert.ok(prompt[0].hook.command.endsWith('hooks/dispatch-prompt.mjs"'), prompt[0].hook.command);
  for (const script of ['nudge.mjs', 'expand-reply.mjs']) {
    assert.deepEqual(hookEntries().filter((entry) => entry.hook.command.includes(script)), [], script);
  }
});

test('one Bash hook runs the dispatcher for the repeat guard, the delegate budget, the booking approval and the six Bash guards', () => {
  const bash = hookEntries().filter((entry) => entry.event === 'PreToolUse' && entry.matcher === 'Bash');
  assert.equal(bash.length, 1, JSON.stringify(bash.map((entry) => entry.hook.command)));
  assert.equal(bash[0].hook.shell, 'bash');
  assert.ok(bash[0].hook.command.endsWith('hooks/dispatch-bash.mjs"'), bash[0].hook.command);
});

test('the session hook points at a memory file only where one exists', () => {
  const hook = fs.readFileSync(path.join(REPOSITORY, 'hooks', 'session-start.sh'), 'utf8');
  assert.match(hook, /--git-common-dir/, 'the memory pointer does not resolve the common git directory');
  assert.match(hook, /if \[ -f "\$memory_file" \]/, 'the memory pointer is added without testing for the file');
  assert.match(hook, /A project memory for/, 'the memory pointer sentence is missing');
});

test('the delegate budget is the only hook before every tool but Bash', () => {
  const everyTool = hookEntries().filter((entry) => entry.event === 'PreToolUse' && entry.matcher === '^(?!Bash$).*');
  assert.equal(everyTool.length, 1);
  assert.ok(everyTool[0].hook.command.endsWith('delegate-budget.mjs"'), everyTool[0].hook.command);
});

test('every shipped guard is a step of the Bash dispatcher and none has a hook of its own', () => {
  // The read guard has its own hook, and the repeat guard its own hooks besides its dispatcher step.
  const guardFiles = fs.readdirSync(path.join(REPOSITORY, 'hooks', 'guards')).filter((name) => name.endsWith('-guard.mjs') && !['read-guard.mjs', 'repeat-guard.mjs'].includes(name));
  assert.deepEqual(guardFiles.sort(), [
    'bash-output-guard.mjs', 'destructive-guard.mjs', 'detach-guard.mjs', 'git-guard.mjs', 'secret-guard.mjs', 'writing-guard.mjs'
  ]);
  const dispatcher = fs.readFileSync(path.join(REPOSITORY, 'hooks', 'dispatch-bash.mjs'), 'utf8');
  for (const guardFile of guardFiles) {
    assert.deepEqual(hookEntries().filter((entry) => entry.hook.command.includes(guardFile)), [], guardFile);
    assert.ok(dispatcher.includes(`./guards/${guardFile}`), `${guardFile} is not imported by the Bash dispatcher`);
  }
});

test('the plugin registers ten hook commands, each under bash', () => {
  const entries = hookEntries();
  assert.equal(entries.length, 10, JSON.stringify(entries.map((entry) => entry.hook.command)));
  for (const { event, hook } of entries) assert.equal(hook.shell, 'bash', `${event}: ${hook.command}`);
});

test('the terse display filter runs under bash on every message and takes no matcher', () => {
  const filter = hookEntries().filter((entry) => entry.hook.command.includes('terse-display.mjs'));
  assert.equal(filter.length, 1);
  assert.equal(filter[0].event, 'MessageDisplay');
  assert.equal(filter[0].matcher, undefined);
  assert.equal(filter[0].hook.shell, 'bash');
  assert.ok(filter[0].hook.command.endsWith('skills/configure/scripts/terse-display.mjs"'), filter[0].hook.command);
});

test('the session hook deletes the savings folder an earlier version left and keeps the rest', () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-savings-'));
  const exoDirectory = path.join(configHome, 'exo');
  fs.mkdirSync(path.join(exoDirectory, 'savings'), { recursive: true });
  fs.writeFileSync(path.join(exoDirectory, 'savings', 'ledger.jsonl'), '{}\n');
  fs.mkdirSync(path.join(exoDirectory, 'handoff'), { recursive: true });
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.sh');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome };
  try {
    execFileSync('bash', [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup' }) });
    assert.equal(fs.existsSync(path.join(exoDirectory, 'savings')), false);
    assert.ok(fs.existsSync(path.join(exoDirectory, 'handoff')));
    assert.ok(fs.existsSync(path.join(exoDirectory, 'plugin-root')));
    execFileSync('bash', [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup' }) });
  } finally {
    fs.rmSync(configHome, { recursive: true, force: true });
  }
});
