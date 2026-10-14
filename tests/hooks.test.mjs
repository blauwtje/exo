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
import { dispatchBash, GUARDS } from '../hooks/dispatch-bash.mjs';

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
  assert.ok(entries.length >= 2, `${entries.length} hook commands`);
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

test('no hook runs a delegate budget, and only Bash, Agent, the context tools and AskUserQuestion have a PreToolUse entry', () => {
  assert.deepEqual(hookEntries().filter((entry) => entry.hook.command.includes('delegate-budget')), []);
  const bashDispatcher = fs.readFileSync(path.join(REPOSITORY, 'hooks', 'dispatch-bash.mjs'), 'utf8');
  assert.doesNotMatch(bashDispatcher, /delegate-budget/);
  assert.deepEqual(hookEntries().filter((entry) => entry.event === 'PreToolUse').map((entry) => entry.matcher), ['Bash', 'Agent', 'Edit|Write|MultiEdit', 'Read|Glob|Grep|WebFetch|WebSearch|Skill|NotebookEdit|ToolSearch|mcp__.*', 'AskUserQuestion']);
});

test('the one Stop hook and the AskUserQuestion hook run the run-no-wait script', () => {
  const entries = hookEntries().filter((entry) => entry.event === 'Stop' || entry.matcher === 'AskUserQuestion');
  assert.deepEqual(entries.map((entry) => entry.event).sort(), ['PreToolUse', 'Stop']);
  for (const { hook } of entries) assert.equal(hook.command, 'node "${CLAUDE_PLUGIN_ROOT}/hooks/run-no-wait.mjs"');
});

test('only SessionStart, PreToolUse and Stop have hooks, and the prompt dispatcher is gone', () => {
  assert.deepEqual(Object.keys(HOOKS).sort(), ['PreToolUse', 'SessionStart', 'Stop']);
  for (const file of ['hooks/dispatch-prompt.mjs', 'hooks/dispatch-steps.mjs', 'hooks/guards/guard-runner.mjs']) {
    assert.equal(fs.existsSync(path.join(REPOSITORY, file)), false, file);
  }
});

test('one Bash hook runs the dispatcher for the three Bash guards', () => {
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

test('the session hook prints no book command', () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-book-'));
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome };
  try {
    const output = execFileSync(process.execPath, [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup' }) }).toString();
    assert.doesNotMatch(JSON.parse(output).hookSpecificOutput.additionalContext, /book --claim/);
  } finally {
    fs.rmSync(configHome, { recursive: true, force: true });
  }
});

test('no tool name matches more than one PreToolUse entry', () => {
  const entries = hookEntries().filter((entry) => entry.event === 'PreToolUse');
  const toolNames = ['Bash', 'Read', 'Edit', 'Write', 'MultiEdit', 'WebFetch', 'WebSearch', 'Task', 'Agent', 'Skill', 'Grep', 'Glob', 'NotebookEdit', 'ToolSearch', 'AskUserQuestion', 'mcp__x__y'];
  for (const toolName of toolNames) {
    const matching = entries.filter((entry) => new RegExp(`^(?:${entry.matcher ?? '.*'})$`).test(toolName));
    assert.ok(matching.length <= 1, `${toolName}: ${JSON.stringify(matching.map((entry) => entry.hook.command))}`);
  }
});

test('every shipped guard is a step of the Bash dispatcher and none has a hook of its own', () => {
  const guardFiles = fs.readdirSync(path.join(REPOSITORY, 'hooks', 'guards')).filter((name) => name.endsWith('-guard.mjs'));
  assert.deepEqual(guardFiles.sort(), [
    'destructive-guard.mjs', 'git-guard.mjs', 'secret-guard.mjs'
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

test('the plugin registers seven hook commands, each under bash', () => {
  const entries = hookEntries();
  assert.equal(entries.length, 7, JSON.stringify(entries.map((entry) => entry.hook.command)));
  for (const { event, hook } of entries) assert.equal(hook.shell, 'bash', `${event}: ${hook.command}`);
});

test('hooks.json lists the run-watch module beside hooks, and the file exists', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPOSITORY, 'hooks', 'hooks.json'), 'utf8'));
  assert.deepEqual(manifest.modules, ['./run-watch.mjs']);
  assert.ok(fs.statSync(path.join(REPOSITORY, 'hooks', 'run-watch.mjs')).isFile());
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

test('the session hook shows no welcome and writes no welcomed marker', () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-welcome-'));
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome };
  try {
    const output = JSON.parse(execFileSync(process.execPath, [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup' }) }).toString());
    assert.equal(output.systemMessage, undefined);
    assert.equal(fs.existsSync(path.join(configHome, 'exo', 'welcomed')), false);
  } finally {
    fs.rmSync(configHome, { recursive: true, force: true });
  }
});

test('no guard file is a process entry of its own', () => {
  for (const name of fs.readdirSync(path.join(REPOSITORY, 'hooks', 'guards'))) {
    const text = fs.readFileSync(path.join(REPOSITORY, 'hooks', 'guards', name), 'utf8');
    assert.doesNotMatch(text, /^#!|isMain|isProcessEntry|readHookText|process\.stdout/m, name);
  }
});

// Each guard alone denies its sample: removing that one guard lets the sample through.
const GUARD_SAMPLES = { 'git-guard': 'git reset --hard', 'secret-guard': 'cat .env', 'destructive-guard': 'docker volume rm data' };

test('each kept guard denies a sample that passes when that guard alone is removed (trust boundary)', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-guards-'));
  fs.mkdirSync(path.join(project, '.claude'));
  fs.writeFileSync(path.join(project, '.claude', 'settings.json'), JSON.stringify({ permissions: { deny: ['Read(./.env)'] } }));
  const saved = Object.fromEntries(['CLAUDE_CONFIG_DIR', 'CLAUDE_PROJECT_DIR', 'EXO_RUN', 'EXO_RUN_DIR'].map((key) => [key, process.env[key]]));
  Object.assign(process.env, { CLAUDE_CONFIG_DIR: project, CLAUDE_PROJECT_DIR: project });
  delete process.env.EXO_RUN;
  delete process.env.EXO_RUN_DIR;
  const decide = (command, guards) => dispatchBash({ tool_name: 'Bash', cwd: project, tool_input: { command } }, guards);
  try {
    assert.deepEqual(GUARDS.map((guard) => guard.name).sort(), Object.keys(GUARD_SAMPLES).sort());
    for (const guard of GUARDS) {
      const sample = GUARD_SAMPLES[guard.name];
      const all = await decide(sample, GUARDS);
      assert.equal(all?.hookSpecificOutput.permissionDecision, 'deny', sample);
      assert.match(all.hookSpecificOutput.permissionDecisionReason, new RegExp(`^${guard.name}:`), sample);
      assert.equal(await decide(sample, GUARDS.filter((other) => other !== guard)), null, `${sample} without ${guard.name}`);
    }
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(project, { recursive: true, force: true });
  }
});

// The plan's low rule, written out so editing schema.json alone fails this test.
const PLAIN_TEXT_LOW_RULE = 'Replies are short. Say the answer first. Use small, everyday words a young child knows. Keep each sentence under 12 words, with one idea. If you must use a work word, say what it means in a few small words. Or leave the work word out. This counts for all text the user reads. Do not start with a warm-up line. Do not end by saying again what you said. Leave out filler words. Do not add words that make you sound unsure. Do not write a wall of text. A list has at most about 5 items, unless the user asks for more. Use no table, unless the user asks for detail. Use no list inside a list, unless the user asks for detail. Keep code, commands, paths and names from code exactly as they are. Keep error text, numbers and warnings exactly as they are. Keep every not, no, only and except. Write a security warning in full sentences. Some steps cannot be undone. Before one, ask the user to confirm. Write that check in full sentences. If the user sends only `?`, say your last reply again in full sentences. Then write out every step, reason and work word. Start every report to the user with at most three short lines. Say what happened. Say whether it worked. Say what the user must do now, or that nothing is needed. Some details go in the run report. These are hashes, counts, paths, changes from the plan and review notes. The run report is `.exo/run-report.md`, or its `.exo/kept/<run>/` copy after cleanup. With no run report, put them in the file the work already wrote. Point to that file in one line. Do not repeat them in the reply. With neither file, share them only when the user asks. Ask the user one question per message. Keep the question to about 10 words. Add at most one short sentence of background. Give 2-3 options of a few words each, in a fixed order. Mark the best option where it stands. The user answers with one letter or ok. The question names no file, no word from inside exo and no model. Name them only when the user picks between them. If more questions wait, the title shows how far you are, like 1/3. Reply in the language the user writes in.';

test('the session hook with no exo settings injects the plain-text short compression rule', () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-plain-'));
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome };
  for (const name of Object.keys(env)) if (name.startsWith('CLAUDE_PLUGIN_OPTION_')) delete env[name];
  for (const name of ['CODEX_HOME', 'EXO_HOST']) delete env[name];
  try {
    const output = JSON.parse(execFileSync(process.execPath, [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup' }) }).toString());
    const context = output.hookSpecificOutput.additionalContext;
    assert.ok(context.includes(PLAIN_TEXT_LOW_RULE));
    assert.ok(context.includes('Ask the user one question per message. Keep the question to about 10 words.'));
  } finally {
    fs.rmSync(configHome, { recursive: true, force: true });
  }
});

test('the session hook injects the shorter compression rule when the plugin option is shorter', () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-shorter-'));
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome, CLAUDE_PLUGIN_OPTION_COMPRESSION: 'shorter' };
  for (const name of ['CODEX_HOME', 'EXO_HOST']) delete env[name];
  try {
    const output = JSON.parse(execFileSync(process.execPath, [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup' }) }).toString());
    const context = output.hookSpecificOutput.additionalContext;
    assert.ok(context.includes('compression=shorter'));
    assert.ok(context.includes('Replies are short. Say the answer first. After the answer, write at most three more lines.'));
    assert.ok(context.includes('Every sentence adds a new fact. Still write whole, simple sentences. Do not cut words short.'));
  } finally {
    fs.rmSync(configHome, { recursive: true, force: true });
  }
});
