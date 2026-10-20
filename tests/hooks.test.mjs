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
  for (const { hook } of entries) assert.ok(hook.command.endsWith('; node "${CLAUDE_PLUGIN_ROOT}/hooks/run-no-wait.mjs"'), hook.command);
});

test('only SessionStart, PreToolUse and Stop have hooks, and the prompt dispatcher is gone', () => {
  assert.deepEqual(Object.keys(HOOKS).sort(), ['PreToolUse', 'SessionStart', 'Stop']);
  for (const file of ['hooks/dispatch-prompt.mjs', 'hooks/dispatch-steps.mjs', 'hooks/guards/guard-runner.mjs']) {
    assert.equal(fs.existsSync(path.join(REPOSITORY, file)), false, file);
  }
});

test('one Bash hook runs the dispatcher for the Bash guard', () => {
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
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome, CLAUDE_PLUGIN_ROOT: REPOSITORY };
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

test('the session hook runs the Node file under bash', () => {
  const [entry] = hookEntries().filter((candidate) => candidate.event === 'SessionStart');
  assert.equal(entry.hook.shell, 'bash');
  assert.ok(entry.hook.command.endsWith('; node "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.mjs"'), entry.hook.command);
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

test('the run-watch wake prompt names the watching reference, and that reference exists', () => {
  assert.ok(fs.readFileSync(path.join(REPOSITORY, 'hooks', 'run-watch.mjs'), 'utf8').includes('exo:spec references/watching.md'));
  assert.ok(fs.statSync(path.join(REPOSITORY, 'skills', 'spec', 'references', 'watching.md')).isFile());
});

test('the session hook deletes the savings folder an earlier version left and keeps the rest', () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-savings-'));
  const exoDirectory = path.join(configHome, 'exo');
  fs.mkdirSync(path.join(exoDirectory, 'savings'), { recursive: true });
  fs.writeFileSync(path.join(exoDirectory, 'savings', 'ledger.jsonl'), '{}\n');
  fs.mkdirSync(path.join(exoDirectory, 'handoff'), { recursive: true });
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome, CLAUDE_PLUGIN_ROOT: REPOSITORY };
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

test('the session hook writes no plugin-root when CLAUDE_PLUGIN_ROOT is unset or names another folder', () => {
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  for (const loaded of [undefined, os.tmpdir()]) {
    const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-pointer-'));
    const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome };
    delete env.CLAUDE_PLUGIN_ROOT;
    if (loaded !== undefined) env.CLAUDE_PLUGIN_ROOT = loaded;
    try {
      execFileSync(process.execPath, [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup' }) });
      assert.equal(fs.existsSync(path.join(configHome, 'exo', 'plugin-root')), false, String(loaded));
    } finally {
      fs.rmSync(configHome, { recursive: true, force: true });
    }
  }
});

test('receipts off drops the "exo is on" line from the session hook', () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-receipts-off-'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-receipts-off-project-'));
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome, CLAUDE_PLUGIN_ROOT: REPOSITORY };
  delete env.CLAUDE_PROJECT_DIR;
  try {
    fs.mkdirSync(path.join(project, '.claude'));
    fs.writeFileSync(path.join(project, '.claude', 'exo.local.json'), '{"receipts":"off"}');
    const run = (cwd) => JSON.parse(execFileSync(process.execPath, [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup', cwd }) }).toString());
    const off = run(project);
    assert.equal(Object.hasOwn(off, 'systemMessage'), false);
    assert.equal(run(os.tmpdir()).systemMessage, 'exo is on');
  } finally {
    for (const directory of [configHome, project]) fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('the session hook shows the user one "exo is on" line and writes no welcomed marker', () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-welcome-'));
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome, CLAUDE_PLUGIN_ROOT: REPOSITORY };
  try {
    const output = JSON.parse(execFileSync(process.execPath, [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup' }) }).toString());
    assert.equal(output.systemMessage, 'exo is on');
    assert.doesNotMatch(output.hookSpecificOutput.additionalContext, /exo is on/);
    assert.equal(fs.existsSync(path.join(configHome, 'exo', 'welcomed')), false);
  } finally {
    fs.rmSync(configHome, { recursive: true, force: true });
  }
});

// The plan's short rule, written out so editing schema.json alone fails this test.
const PLAIN_TEXT_SHORT_RULE = 'Say the answer first. Keep code, commands, paths, names from code, error text, numbers and warnings exactly as they are, and keep every not, no, only and except. Write a security warning in full sentences. Before a step that cannot be undone, ask the user to confirm. Reply in the language the user writes in. Open every report to the user with at most three short lines: what happened, whether it worked, and what the user must do now or that nothing is needed. Hashes, counts, paths, plan changes and review notes go in `.exo/run-report.md`, or its `.exo/kept/<run>/` copy after cleanup, else in the file the work already wrote; point to it in one line, not repeated in the reply. With neither file, share them only when asked. Ask the user one question per message: about 10 words, at most one short sentence of background, 2-3 short options in a fixed order, the best one marked where it stands, answered with one letter or ok. The question names no file, no word from inside exo and no model, unless the user picks between them. If more questions wait, the title shows progress, like 1/3.';
const PROSE_CLAMP = 'Use small, everyday words a young child knows. Keep each sentence under 12 words, with one idea.';

function sessionContext(prefix, option) {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome, CLAUDE_PLUGIN_ROOT: REPOSITORY };
  for (const name of Object.keys(env)) if (name.startsWith('CLAUDE_PLUGIN_OPTION_')) delete env[name];
  for (const name of ['CODEX_HOME', 'EXO_HOST']) delete env[name];
  if (option) env.CLAUDE_PLUGIN_OPTION_COMPRESSION = option;
  try {
    const output = JSON.parse(execFileSync(process.execPath, [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup' }) }).toString());
    return output.hookSpecificOutput.additionalContext;
  } finally {
    fs.rmSync(configHome, { recursive: true, force: true });
  }
}

test('the session hook with no exo settings injects no reply rules, only the fix-all and confirm lines', () => {
  const context = sessionContext('exo-plain-');
  assert.ok(context.includes('compression=off (default)'));
  assert.ok(!context.includes('Say the answer first.'));
  assert.ok(!context.includes('one question per message'));
  assert.ok(context.includes('Diagnosed causes → fix all, not cut scope or ask;'));
  assert.ok(context.includes('Irreversible step → confirm with user first.'));
});

test('the session hook injects the short rule when the plugin option is short or the old low', () => {
  for (const option of ['short', 'low']) {
    const context = sessionContext('exo-short-', option);
    assert.ok(context.includes(PLAIN_TEXT_SHORT_RULE));
    assert.ok(!context.includes(PROSE_CLAMP));
  }
});

test('the exo:short output style carries the short rule text word for word', () => {
  const style = fs.readFileSync(path.join(REPOSITORY, 'output-styles', 'short.md'), 'utf8');
  assert.match(style, /^---\nname: short\n[\s\S]*keep-coding-instructions: true\n---\n/);
  assert.equal(style.replace(/^---\n[\s\S]*?\n---\n/, '').trim(), PLAIN_TEXT_SHORT_RULE);
});

test('the session hook injects the prose clamp with the report shape and questions when the plugin option is shorter or the old high', () => {
  for (const option of ['shorter', 'high']) {
    const context = sessionContext('exo-shorter-', option);
    assert.ok(context.includes('compression=shorter'));
    assert.ok(context.includes('Replies are short. Say the answer first. After the answer, write at most three more lines.'));
    assert.ok(context.includes(PROSE_CLAMP));
    assert.ok(context.includes('Start every report to the user with at most three short lines.'));
    assert.ok(context.includes('Ask the user one question per message. Keep the question to about 10 words.'));
  }
});

test('the session hook injects no compression rule when the plugin option is off', () => {
  const context = sessionContext('exo-off-', 'off');
  assert.ok(!context.includes('Say the answer first.'));
  assert.ok(!context.includes(PROSE_CLAMP));
  assert.ok(!context.includes('one question per message'));
});

test('the session hook reads project settings from the session directory in the hook input, not its own working directory', () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-cwd-'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-cwd-project-'));
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-cwd-elsewhere-'));
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome, CLAUDE_PLUGIN_ROOT: REPOSITORY };
  for (const name of Object.keys(env)) if (name.startsWith('CLAUDE_PLUGIN_OPTION_')) delete env[name];
  for (const name of ['CODEX_HOME', 'EXO_HOST', 'CLAUDE_PROJECT_DIR']) delete env[name];
  try {
    execFileSync('git', ['init', '-q', project]);
    fs.mkdirSync(path.join(project, '.claude'));
    fs.writeFileSync(path.join(project, '.claude', 'exo.json'), JSON.stringify({ compression: 'shorter' }));
    const output = JSON.parse(execFileSync(process.execPath, [hook], { env, cwd: elsewhere, input: JSON.stringify({ session_id: 's1', source: 'startup', cwd: project }) }).toString());
    assert.ok(output.hookSpecificOutput.additionalContext.includes('compression=shorter'));
  } finally {
    for (const directory of [configHome, project, elsewhere]) fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('the session hook adds a Node warning to the user line only when Node is older than package.json engines', () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-node-'));
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-node-root-'));
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome };
  for (const name of ['CLAUDE_PLUGIN_ROOT', 'CODEX_HOME', 'EXO_HOST', 'EXO_RUN_DIR']) delete env[name];
  const manifest = JSON.parse(fs.readFileSync(path.join(REPOSITORY, 'package.json'), 'utf8'));
  fs.mkdirSync(path.join(copy, 'hooks'));
  for (const folder of new Set(Object.values(manifest.imports).map((target) => target.split('/')[1]))) fs.symlinkSync(path.join(REPOSITORY, folder), path.join(copy, folder));
  for (const file of ['session-start.mjs', 'dispatch-rules.mjs']) fs.copyFileSync(path.join(REPOSITORY, 'hooks', file), path.join(copy, 'hooks', file));
  try {
    const messageFor = (engines) => {
      fs.writeFileSync(path.join(copy, 'package.json'), JSON.stringify({ type: 'module', engines, imports: manifest.imports }));
      return JSON.parse(execFileSync(process.execPath, [path.join(copy, 'hooks', 'session-start.mjs')], { env, input: '{}' }).toString()).systemMessage;
    };
    const current = Number(process.versions.node.split('.')[0]);
    assert.equal(messageFor({ node: `>=${current}` }), 'exo is on');
    const warned = messageFor({ node: `>=${current + 1}` });
    assert.ok(warned.startsWith('exo is on\n'));
    assert.ok(warned.includes(`needs Node ${current + 1} or newer`) && warned.includes(`this is Node ${process.versions.node}`));
  } finally {
    for (const directory of [configHome, copy]) fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('the Stop hook lets a repair session end without a task status line', async () => {
  const { runNoWait } = await import('../hooks/run-no-wait.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-no-wait-'));
  const env = { EXO_RUN: 'run', EXO_RUN_DIR: dir, EXO_RUN_TASK: 'plan/1', EXO_RUN_REPAIR: '1' };
  const input = { hook_event_name: 'Stop', session_id: 's', last_assistant_message: 'Plan: docs/plan.md\nTask 1 rewritten: Files: line names lib/a.mjs.' };
  assert.equal(runNoWait(input, { env }), null);
  fs.rmSync(dir, { recursive: true, force: true });
});
