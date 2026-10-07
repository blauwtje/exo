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

test('the delegate budget runs before every tool call and after no call, in the Bash dispatcher for Bash', () => {
  const budgets = hookEntries().filter((entry) => entry.hook.command.includes('delegate-budget.mjs'));
  assert.deepEqual(budgets.map((entry) => [entry.event, entry.matcher]), [['PreToolUse', '^(?!Bash$).*']]);
  const bashDispatcher = fs.readFileSync(path.join(REPOSITORY, 'hooks', 'dispatch-bash.mjs'), 'utf8');
  assert.match(bashDispatcher, /name: 'delegate-budget'/, 'the Bash dispatcher does not run the delegate budget');
  const matcher = new RegExp(budgets[0].matcher);
  assert.equal(matcher.test('Bash'), false);
  for (const tool of ['Read', 'Edit', 'WebFetch', 'WebSearch', 'Write', 'MultiEdit', 'ReadFile', 'Task', 'Agent', 'BashOutput', 'mcp__server__Bash', 'TaskUpdate']) assert.equal(matcher.test(tool), true, tool);
});

test('one Stop hook runs the dispatcher that books the turn, keeps a plan going, checks build-change proof and scores terse replies', () => {
  const stop = hookEntries().filter((entry) => entry.event === 'Stop');
  assert.equal(stop.length, 1, JSON.stringify(stop.map((entry) => entry.hook.command)));
  assert.equal(stop[0].matcher, undefined);
  assert.ok(stop[0].hook.command.endsWith('hooks/dispatch-stop.mjs"'), stop[0].hook.command);
});

test('one prompt hook runs the dispatcher for the reply expander, and takes no matcher', () => {
  const prompt = hookEntries().filter((entry) => entry.event === 'UserPromptSubmit');
  assert.equal(prompt.length, 1, JSON.stringify(prompt.map((entry) => entry.hook.command)));
  assert.equal(prompt[0].matcher, undefined);
  assert.equal(prompt[0].hook.shell, 'bash');
  assert.ok(prompt[0].hook.command.endsWith('hooks/dispatch-prompt.mjs"'), prompt[0].hook.command);
  for (const script of ['approve-book.mjs', 'expand-reply.mjs']) {
    assert.deepEqual(hookEntries().filter((entry) => entry.hook.command.includes(script)), [], script);
  }
});

test('one Bash hook runs the dispatcher for the delegate budget, the booking approval and the five Bash guards', () => {
  const bash = hookEntries().filter((entry) => entry.event === 'PreToolUse' && entry.matcher === 'Bash');
  assert.equal(bash.length, 1, JSON.stringify(bash.map((entry) => entry.hook.command)));
  assert.equal(bash[0].hook.shell, 'bash');
  assert.ok(bash[0].hook.command.endsWith('hooks/dispatch-bash.mjs"'), bash[0].hook.command);
});

test('the session hook points at a memory file only where one exists', () => {
  const hook = fs.readFileSync(path.join(REPOSITORY, 'hooks', 'session-start.mjs'), 'utf8');
  assert.match(hook, /--git-common-dir/, 'the memory pointer does not resolve the common git directory');
  assert.match(hook, /fs\.existsSync\(memoryFile\)/, 'the memory pointer is added without testing for the file');
  assert.match(hook, /A project memory for/, 'the memory pointer sentence is missing');
});

test('the session hook prints the book command once per session, and approve allows it', () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-book-'));
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome };
  const context = (input) => JSON.parse(execFileSync(process.execPath, [hook], { env, input: JSON.stringify(input) }).toString()).hookSpecificOutput.additionalContext;
  try {
    for (const source of ['startup', 'resume', 'clear', 'compact']) {
      assert.match(context({ session_id: 's1', source }), /corrects a repository fact, in any language, run `node "[^`]+memory\.mjs" book --claim "<one sentence>" --quote "<the user's words, verbatim>" --session "s1"`/, source);
    }
    assert.doesNotMatch(context({ source: 'startup' }), /book --claim/);
  } finally {
    fs.rmSync(configHome, { recursive: true, force: true });
  }
});

test('no tool name matches more than one PreToolUse entry', () => {
  const entries = hookEntries().filter((entry) => entry.event === 'PreToolUse');
  const toolNames = ['Bash', 'Read', 'Edit', 'Write', 'WebFetch', 'WebSearch', 'Task', 'Agent', 'Skill', 'Grep', 'Glob'];
  for (const toolName of toolNames) {
    const matching = entries.filter((entry) => new RegExp(`^(?:${entry.matcher ?? '.*'})$`).test(toolName));
    assert.ok(matching.length <= 1, `${toolName}: ${JSON.stringify(matching.map((entry) => entry.hook.command))}`);
  }
});

test('the delegate budget is the only hook before every tool but Bash', () => {
  const everyTool = hookEntries().filter((entry) => entry.event === 'PreToolUse' && entry.matcher === '^(?!Bash$).*');
  assert.equal(everyTool.length, 1);
  assert.ok(everyTool[0].hook.command.endsWith('delegate-budget.mjs"'), everyTool[0].hook.command);
});

test('every shipped guard is a step of the Bash dispatcher and none has a hook of its own', () => {
  const guardFiles = fs.readdirSync(path.join(REPOSITORY, 'hooks', 'guards')).filter((name) => name.endsWith('-guard.mjs'));
  assert.deepEqual(guardFiles.sort(), [
    'destructive-guard.mjs', 'detach-guard.mjs', 'git-guard.mjs', 'secret-guard.mjs', 'writing-guard.mjs'
  ]);
  const dispatcher = fs.readFileSync(path.join(REPOSITORY, 'hooks', 'dispatch-bash.mjs'), 'utf8');
  for (const guardFile of guardFiles) {
    assert.deepEqual(hookEntries().filter((entry) => entry.hook.command.includes(guardFile)), [], guardFile);
    assert.ok(dispatcher.includes(`./guards/${guardFile}`), `${guardFile} is not imported by the Bash dispatcher`);
  }
});

test('the session hook runs the Node file under bash', () => {
  const [entry] = hookEntries().filter((candidate) => candidate.event === 'SessionStart');
  assert.equal(entry.hook.shell, 'bash');
  assert.equal(entry.hook.command, 'node "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.mjs"');
});

test('the plugin registers five hook commands, each under bash', () => {
  const entries = hookEntries();
  assert.equal(entries.length, 5, JSON.stringify(entries.map((entry) => entry.hook.command)));
  for (const { event, hook } of entries) assert.equal(hook.shell, 'bash', `${event}: ${hook.command}`);
});

test('the session hook deletes the savings folder an earlier version left and keeps the rest', () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-savings-'));
  const exoDirectory = path.join(configHome, 'exo');
  fs.mkdirSync(path.join(exoDirectory, 'savings'), { recursive: true });
  fs.writeFileSync(path.join(exoDirectory, 'savings', 'ledger.jsonl'), '{}\n');
  fs.mkdirSync(path.join(exoDirectory, 'handoff'), { recursive: true });
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome };
  try {
    execFileSync(process.execPath, [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup' }) });
    assert.equal(fs.existsSync(path.join(exoDirectory, 'savings')), false);
    assert.ok(fs.existsSync(path.join(exoDirectory, 'handoff')));
    assert.ok(fs.existsSync(path.join(exoDirectory, 'plugin-root')));
    execFileSync(process.execPath, [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup' }) });
  } finally {
    fs.rmSync(configHome, { recursive: true, force: true });
  }
});

test('the session hook shows a welcome systemMessage once per machine and writes a welcomed marker', () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-welcome-'));
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome };
  const run = () => JSON.parse(execFileSync(process.execPath, [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup' }) }).toString());
  try {
    const first = run();
    assert.match(first.systemMessage, /\/exo:start/);
    assert.ok(fs.existsSync(path.join(configHome, 'exo', 'welcomed')));
    assert.equal(run().systemMessage, undefined);
  } finally {
    fs.rmSync(configHome, { recursive: true, force: true });
  }
});
