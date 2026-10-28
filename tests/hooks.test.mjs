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

// The hook reads the session provider from the environment; these tests expect the claude column.
delete process.env.EXO_PROVIDER;

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

test('only SessionStart, PreToolUse, SubagentStart and Stop have hooks, and the prompt dispatcher is gone', () => {
  assert.deepEqual(Object.keys(HOOKS).sort(), ['PreToolUse', 'SessionStart', 'Stop', 'SubagentStart']);
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

test('the plugin registers eight hook commands, each under bash', () => {
  const entries = hookEntries();
  assert.equal(entries.length, 8, JSON.stringify(entries.map((entry) => entry.hook.command)));
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

test('the session hook writes plugin-root and leaves the rest of the config folder', () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-config-'));
  const exoDirectory = path.join(configHome, 'exo');
  fs.mkdirSync(path.join(exoDirectory, 'handoff'), { recursive: true });
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome, CLAUDE_PLUGIN_ROOT: REPOSITORY };
  try {
    execFileSync(process.execPath, [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup' }) });
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
  assert.ok(!context.includes('compression'));
  assert.ok(!context.includes('Say the answer first.'));
  assert.ok(!context.includes('one question per message'));
  assert.ok(context.includes('Diagnosed causes → fix all, not cut scope or ask;'));
  assert.ok(context.includes('Irreversible step → confirm with user first.'));
});

test('the exo:adhd output style carries its frontmatter and each outranking rule', () => {
  const style = fs.readFileSync(path.join(REPOSITORY, 'output-styles', 'adhd.md'), 'utf8');
  assert.match(style, /^---\nname: adhd\ndescription: .+\nkeep-coding-instructions: true\n---\n/);
  for (const phrase of ['exactly as they are', 'every not, no, only and except', 'security warning in full sentences', 'ask the user to confirm', 'one question per message', 'reply in english, whatever language the user writes in', '.exo/run-report.md', 'lone `?`']) {
    assert.ok(style.toLowerCase().includes(phrase.toLowerCase()), phrase);
  }
});

test('the session hook gives no compression entry and no rule text for a stored compression value', () => {
  for (const option of ['short', 'shorter', 'low', 'high']) {
    const context = sessionContext('exo-stored-', option);
    assert.ok(!context.includes('compression'));
    assert.ok(!context.includes('Say the answer first.'));
    assert.ok(!context.includes('one question per message'));
  }
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
    fs.writeFileSync(path.join(project, '.claude', 'exo.json'), JSON.stringify({ specs: 'issues' }));
    const output = JSON.parse(execFileSync(process.execPath, [hook], { env, cwd: elsewhere, input: JSON.stringify({ session_id: 's1', source: 'startup', cwd: project }) }).toString());
    assert.ok(output.hookSpecificOutput.additionalContext.includes('specs=issues'));
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

test('the dispatch rules leave agent models to the kind table and send long command output to a log', () => {
  const rules = fs.readFileSync(path.join(REPOSITORY, 'hooks', 'dispatch-rules.md'), 'utf8');
  assert.match(rules, /pass no `model` or `effort`, the kind table decides/);
  assert.match(rules, /long command output goes to a log under `\.exo\/`/);
  assert.doesNotMatch(rules, /cheapest and low for lookups/);
});

test('the dispatch rules send a brief with an open choice or unknown cause to the hardest kind and a decided fix to build', async () => {
  const rules = fs.readFileSync(path.join(REPOSITORY, 'hooks', 'dispatch-rules.md'), 'utf8');
  assert.match(rules, /design, architecture or solution choice open, or asks for an unknown cause → first brief line `exo-kind: hardest`/);
  assert.match(rules, /fully decided fix → `exo-kind: build`/);
  const { agentEffort } = await import('../hooks/agent-effort.mjs');
  const { readKindTable } = await import('../lib/model-kinds.mjs');
  const { kinds } = readKindTable(undefined, { budget: 'on' });
  const modelOf = (prompt) => agentEffort({ tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose', prompt } }, 'on').hookSpecificOutput.updatedInput.model;
  assert.equal(modelOf('exo-kind: hardest\nPick the cache design'), kinds.hardest.model);
  assert.equal(modelOf('exo-kind: build\nApply the decided fix'), kinds.build.model);
});

test('a subagent Bash call is denied a shared-state git command at command position, the lead and other commands are not', async () => {
  const { dispatchBash } = await import('../hooks/dispatch-bash.mjs');
  const decide = async (command, agentId) => {
    const output = await dispatchBash({ hook_event_name: 'PreToolUse', tool_name: 'Bash', agent_id: agentId, tool_input: { command } }, undefined, () => false);
    return output?.hookSpecificOutput?.permissionDecision;
  };
  const denied = ['git stash', 'git stash pop', 'cd x && git stash list', 'git -C ../other worktree remove w', 'git worktree prune', 'git branch -D run', 'git branch -m old new', 'git branch --delete x', '(git worktree move a b)', 'git --no-pager stash', 'git -c k=v stash pop', 'git --git-dir=.git stash', 'git --git-dir x stash', 'git -C dir stash', 'git --work-tree w --no-pager worktree remove w', 'git worktree  remove w', 'git branch -q -D x', 'git branch -df x', 'git branch --force -d x', 'git branch -f -m a b', 'if git stash; then :; fi', '{ git stash; }', 'time git stash', 'x=`git stash`', 'echo ok | git stash', 'if true; then git stash; fi', 'git branch run -D', 'git branch run -d', 'git branch old -m new', 'git branch --del x', 'git branch --de x', 'git branch --d x', 'git branch -f -D x', '! git stash', 'exec git stash', 'command git stash', 'env git stash', 'env A=1 git stash', 'sudo git stash', 'git stash>/dev/null', 'git worktree prune>/dev/null', 'git 2>/dev/null stash', 'git >log branch -D x'];
  for (const command of denied) assert.equal(await decide(command, 'agent-1'), 'deny', command);
  for (const command of denied) assert.notEqual(await decide(command, undefined), 'deny', `lead ${command}`);
  const allowed = ['git commit -m "no git stash here"', 'grep "git stash" notes.md', 'git status', 'git branch --show-current', 'git worktree list', 'git log --oneline', 'git --no-pager log --oneline', 'git -c k=v status', 'git --git-dir=.git worktree list', 'git commit --amend -m x', 'git log --stash', 'git branch --sort -committerdate', 'git commit -m "then git stash later"', 'git branch -v', 'git branch -a --list x', 'git branch --no-merged', 'git branch -vv', 'git status >/dev/null 2>&1', 'git log >stash'];
  for (const command of allowed) assert.notEqual(await decide(command, 'agent-1'), 'deny', command);
});

test('a subagent Bash call is denied a shared-state git command handed to a wrapper or behind any prefix before git, and echo git stash is a documented deny', async () => {
  const { dispatchBash } = await import('../hooks/dispatch-bash.mjs');
  const decide = async (command) => {
    const output = await dispatchBash({ hook_event_name: 'PreToolUse', tool_name: 'Bash', agent_id: 'agent-1', tool_input: { command } }, undefined, () => false);
    return output?.hookSpecificOutput?.permissionDecision;
  };
  const denied = ['bash -c "git stash"', "sh -c 'git branch -D x'", 'zsh -c "cd x && git stash"', 'bash -lc "git stash"', 'nohup git stash', 'nice git stash', 'xargs git branch -D', 'sudo bash -c "git stash"', 'bash -c "bash -c \\"git stash\\""', 'xargs -n1 git branch -D', 'xargs -r git stash', 'nice -n 10 git stash', 'timeout 5 git stash', 'sudo -u me git worktree remove w', 'env A=1 git stash', '/usr/bin/git stash', 'eval "git stash"', 'eval git branch -D x', 'echo git stash', "sh -c 'echo git stash'"];
  for (const command of denied) assert.equal(await decide(command), 'deny', command);
  const allowed = ['bash -c "git status"', 'bash script.sh', 'nohup git status', 'xargs git log', 'bash -c "echo hi"', 'xargs -n1 git log', 'timeout 5 git status', 'git commit -m "then git stash"'];
  for (const command of allowed) assert.notEqual(await decide(command), 'deny', command);
});

test('the git deny list is not a sandbox: git code fed to a shell through here-string or pipe is out of scope and allowed', async () => {
  const { dispatchBash } = await import('../hooks/dispatch-bash.mjs');
  const decide = async (command) => {
    const output = await dispatchBash({ hook_event_name: 'PreToolUse', tool_name: 'Bash', agent_id: 'agent-1', tool_input: { command } }, undefined, () => false);
    return output?.hookSpecificOutput?.permissionDecision;
  };
  const outOfScope = ['bash <<< "git stash"', 'echo "git stash" | sh'];
  for (const command of outOfScope) assert.notEqual(await decide(command), 'deny', command);
});

const LINEAR_SMALL = 2000;
const LINEAR_GROWTH = 8;
const LINEAR_MAX_RATIO = 20;
const LINEAR_RUNS = 5;

const allowedGitCommands = (count) => [`git${' --git-dir'.repeat(count)} log`, 'git branch '.repeat(count * 2), `git${' -C git'.repeat(count)} log`, 'bash '.repeat(count * 2)];
const deniedGitCommand = (count) => `git${' --git-dir'.repeat(count)} stash`;

function bestTime(action) {
  let best = Infinity;
  for (let run = 0; run < LINEAR_RUNS; run += 1) {
    const start = performance.now();
    action();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

function decideAllGitCommands(sharesGitState, count) {
  const allowed = allowedGitCommands(count);
  const denied = deniedGitCommand(count);
  return () => {
    allowed.forEach((command) => sharesGitState(command));
    sharesGitState(denied);
  };
}

test('deciding a long run of git global options grows linearly with its length', async () => {
  const { sharesGitState } = await import('../lib/git-deny.mjs');
  allowedGitCommands(LINEAR_SMALL).forEach((command) => assert.equal(sharesGitState(command), false, command.slice(0, 40)));
  assert.equal(sharesGitState(deniedGitCommand(LINEAR_SMALL)), true);
  decideAllGitCommands(sharesGitState, LINEAR_SMALL)();
  const small = bestTime(decideAllGitCommands(sharesGitState, LINEAR_SMALL));
  const large = bestTime(decideAllGitCommands(sharesGitState, LINEAR_SMALL * LINEAR_GROWTH));
  const ratio = large / Math.max(small, 0.05);
  assert.ok(ratio < LINEAR_MAX_RATIO, `${LINEAR_GROWTH}x the options took ${ratio.toFixed(1)}x the time (${small.toFixed(2)} ms to ${large.toFixed(2)} ms)`);
});
