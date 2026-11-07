// hooks.json names only scripts the plugin ships, and runs the SessionStart
// hook under bash on every session start, so a host without Git Bash does not
// fall back to PowerShell and a resumed session gets a current pointer.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tempDir } from './harness.mjs';

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

test('only SessionStart, SessionEnd, PreToolUse and Stop have hooks, and the prompt dispatcher and SubagentStop hook are gone', () => {
  assert.deepEqual(Object.keys(HOOKS).sort(), ['PreToolUse', 'SessionEnd', 'SessionStart', 'Stop']);
  for (const file of ['hooks/dispatch-prompt.mjs', 'hooks/dispatch-steps.mjs', 'hooks/guards/guard-runner.mjs', 'hooks/agent-stop.mjs']) {
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
  assert.match(hook, /commonDir\(cwd\)/, 'the memory pointer does not resolve the common git directory');
  assert.match(hook, /fs\.existsSync\(memoryFile\)/, 'the memory pointer is added without testing for the file');
  assert.match(hook, /A project memory for/, 'the memory pointer sentence is missing');
  assert.match(hook, /ask the user to type \\`\/exo:remember\\` to change it/, 'the memory pointer does not name the typed command');
});

test('the session hook prints no book command', () => {
  const configHome = tempDir('exo-book-');
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome, CLAUDE_PLUGIN_ROOT: REPOSITORY };
  const output = execFileSync(process.execPath, [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup' }) }).toString();
  assert.doesNotMatch(JSON.parse(output).hookSpecificOutput.additionalContext, /book --claim/);
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
  const configHome = tempDir('exo-config-');
  const exoDirectory = path.join(configHome, 'exo');
  fs.mkdirSync(path.join(exoDirectory, 'handoff'), { recursive: true });
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome, CLAUDE_PLUGIN_ROOT: REPOSITORY };
  execFileSync(process.execPath, [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup' }) });
  assert.ok(fs.existsSync(path.join(exoDirectory, 'handoff')));
  assert.ok(fs.existsSync(path.join(exoDirectory, 'plugin-root')));
  execFileSync(process.execPath, [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup' }) });
});

test('the session hook writes no plugin-root when CLAUDE_PLUGIN_ROOT is unset or names another folder', () => {
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  for (const loaded of [undefined, os.tmpdir()]) {
    const configHome = tempDir('exo-pointer-');
    const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome };
    delete env.CLAUDE_PLUGIN_ROOT;
    if (loaded !== undefined) env.CLAUDE_PLUGIN_ROOT = loaded;
    execFileSync(process.execPath, [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup' }) });
    assert.equal(fs.existsSync(path.join(configHome, 'exo', 'plugin-root')), false, String(loaded));
  }
});

test('receipts off drops the "exo is on" line from the session hook', () => {
  const configHome = tempDir('exo-receipts-off-');
  const project = tempDir('exo-receipts-off-project-');
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome, CLAUDE_PLUGIN_ROOT: REPOSITORY };
  delete env.CLAUDE_PROJECT_DIR;
  fs.mkdirSync(path.join(project, '.claude'));
  fs.writeFileSync(path.join(project, '.claude', 'exo.local.json'), '{"receipts":"off"}');
  const run = (cwd) => JSON.parse(execFileSync(process.execPath, [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup', cwd }) }).toString());
  const off = run(project);
  assert.equal(Object.hasOwn(off, 'systemMessage'), false);
  assert.equal(run(os.tmpdir()).systemMessage, 'exo is on');
});

test('the session hook shows the user one "exo is on" line and writes no welcomed marker', () => {
  const configHome = tempDir('exo-welcome-');
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome, CLAUDE_PLUGIN_ROOT: REPOSITORY };
  const output = JSON.parse(execFileSync(process.execPath, [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup' }) }).toString());
  assert.equal(output.systemMessage, 'exo is on');
  assert.doesNotMatch(output.hookSpecificOutput.additionalContext, /exo is on/);
  assert.equal(fs.existsSync(path.join(configHome, 'exo', 'welcomed')), false);
});

function sessionContext(prefix, option) {
  const configHome = tempDir(prefix);
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome, CLAUDE_PLUGIN_ROOT: REPOSITORY };
  for (const name of Object.keys(env)) if (name.startsWith('CLAUDE_PLUGIN_OPTION_')) delete env[name];
  for (const name of ['CODEX_HOME', 'EXO_HOST']) delete env[name];
  if (option) env.CLAUDE_PLUGIN_OPTION_COMPRESSION = option;
  const output = JSON.parse(execFileSync(process.execPath, [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup' }) }).toString());
  return output.hookSpecificOutput.additionalContext;
}

test('the session hook with no exo settings injects no reply rules, only the fix-all and confirm lines', () => {
  const context = sessionContext('exo-plain-');
  assert.ok(!context.includes('compression'));
  assert.ok(!context.includes('Say the answer first.'));
  assert.ok(!context.includes('one question per message'));
  assert.ok(context.includes('Fix all diagnosed causes instead of cutting scope or asking,'));
  assert.ok(context.includes('Ask instead when the step is irreversible, has no safe default'));
});

test('the exo:adhd output style carries its frontmatter and each outranking rule', () => {
  const style = fs.readFileSync(path.join(REPOSITORY, 'output-styles', 'adhd.md'), 'utf8');
  assert.match(style, /^---\nname: adhd\ndescription: .+\nkeep-coding-instructions: true\n---\n/);
  for (const phrase of ['exactly as they are', 'every not, no, only and except', 'security warning in full sentences', 'ask the user to confirm', 'one question per message', 'reply entirely in the user\'s language', '.exo/run-report.md', 'lone `?`']) {
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
  const configHome = tempDir('exo-cwd-');
  const project = tempDir('exo-cwd-project-');
  const elsewhere = tempDir('exo-cwd-elsewhere-');
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome, CLAUDE_PLUGIN_ROOT: REPOSITORY };
  for (const name of Object.keys(env)) if (name.startsWith('CLAUDE_PLUGIN_OPTION_')) delete env[name];
  for (const name of ['CODEX_HOME', 'EXO_HOST', 'CLAUDE_PROJECT_DIR']) delete env[name];
  execFileSync('git', ['init', '-q', project]);
  fs.mkdirSync(path.join(project, '.claude'));
  fs.writeFileSync(path.join(project, '.claude', 'exo.json'), JSON.stringify({ specs: 'issues' }));
  const output = JSON.parse(execFileSync(process.execPath, [hook], { env, cwd: elsewhere, input: JSON.stringify({ session_id: 's1', source: 'startup', cwd: project }) }).toString());
  assert.ok(output.hookSpecificOutput.additionalContext.includes('specs=issues'));
});

test('the session hook adds a Node warning to the user line only when Node is older than package.json engines', () => {
  const configHome = tempDir('exo-node-');
  const copy = tempDir('exo-node-root-');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configHome };
  for (const name of ['CLAUDE_PLUGIN_ROOT', 'CODEX_HOME', 'EXO_HOST', 'EXO_RUN_DIR']) delete env[name];
  const manifest = JSON.parse(fs.readFileSync(path.join(REPOSITORY, 'package.json'), 'utf8'));
  fs.mkdirSync(path.join(copy, 'hooks'));
  for (const folder of new Set(Object.values(manifest.imports).map((target) => target.split('/')[1]))) fs.symlinkSync(path.join(REPOSITORY, folder), path.join(copy, folder));
  for (const file of ['session-start.mjs', 'dispatch-rules.mjs']) fs.copyFileSync(path.join(REPOSITORY, 'hooks', file), path.join(copy, 'hooks', file));
  const messageFor = (engines) => {
    fs.writeFileSync(path.join(copy, 'package.json'), JSON.stringify({ type: 'module', engines, imports: manifest.imports }));
    return JSON.parse(execFileSync(process.execPath, [path.join(copy, 'hooks', 'session-start.mjs')], { env, input: '{}' }).toString()).systemMessage;
  };
  const current = Number(process.versions.node.split('.')[0]);
  assert.equal(messageFor({ node: `>=${current}` }), 'exo is on');
  const warned = messageFor({ node: `>=${current + 1}` });
  assert.ok(warned.startsWith('exo is on\n'));
  assert.ok(warned.includes(`needs Node ${current + 1} or newer`) && warned.includes(`this is Node ${process.versions.node}`));
});

test('the Stop hook lets a repair session end without a task status line', async () => {
  const { runNoWait } = await import('../hooks/run-no-wait.mjs');
  const dir = tempDir('run-no-wait-');
  const env = { EXO_RUN: 'run', EXO_RUN_DIR: dir, EXO_RUN_TASK: 'plan/1', EXO_RUN_REPAIR: '1' };
  const input = { hook_event_name: 'Stop', session_id: 's', last_assistant_message: 'Plan: docs/plan.md\nTask 1 rewritten: Files: line names lib/a.mjs.' };
  assert.equal(runNoWait(input, { env }), null);
});

test('the dispatch rules leave agent models to the kind table and send long command output to a log', () => {
  const rules = fs.readFileSync(path.join(REPOSITORY, 'hooks', 'dispatch-rules.md'), 'utf8');
  assert.match(rules, /pass no `model` or `effort` because the kind table decides/);
  assert.match(rules, /Send long command output to a log under `\.exo\/`/);
  assert.doesNotMatch(rules, /cheapest and low for lookups/);
});

test('the dispatch file rule names exo:fetch-docs as returning inline', () => {
  const rules = fs.readFileSync(path.join(REPOSITORY, 'hooks', 'dispatch-rules.md'), 'utf8');
  assert.match(rules, /agent writes findings to a named file under `\.exo\/<topic>\/`[^\n]*`exo:fetch-docs` returns inline/);
  const contributing = fs.readFileSync(path.join(REPOSITORY, 'CONTRIBUTING.md'), 'utf8');
  assert.match(contributing, /\*\*Dispatch rules\*\*[^\n]*`exo:fetch-docs` returns inline/);
});

test('the dispatch rules send a brief with an open choice or unknown cause to the hardest kind and a decided fix to build', async () => {
  const rules = fs.readFileSync(path.join(REPOSITORY, 'hooks', 'dispatch-rules.md'), 'utf8');
  assert.match(rules, /first brief line `exo-kind: hardest` when its brief leaves a design, architecture or solution choice open or asks for an unknown cause/);
  assert.match(rules, /`exo-kind: build` when the brief is a fully decided fix/);
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

test('a subagent Bash command over 4 KB is denied with a pointer to .exo/, the lead and small commands are not', async () => {
  const { dispatchBash } = await import('../hooks/dispatch-bash.mjs');
  const run = (command, agentId) => dispatchBash({ hook_event_name: 'PreToolUse', tool_name: 'Bash', agent_id: agentId, tool_input: { command } }, undefined, () => false);
  const big = `echo ${'a'.repeat(4100)}`;
  const denied = await run(big, 'agent-1');
  assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(denied.hookSpecificOutput.permissionDecisionReason, /\.exo\//);
  assert.notEqual((await run(big, undefined))?.hookSpecificOutput?.permissionDecision, 'deny');
  assert.notEqual((await run('echo hi', 'agent-1'))?.hookSpecificOutput?.permissionDecision, 'deny');
});

const LINEAR_SMALL = 2000;
const LINEAR_GROWTH = 8;
const LINEAR_MAX_RATIO = 20;
const LINEAR_RUNS = 5;

const allowedGitCommands = (count) => [`git${' --git-dir'.repeat(count)} log`, 'git branch '.repeat(count * 2), `git${' -C git'.repeat(count)} log`, 'bash '.repeat(count * 2)];
const deniedGitCommand = (count) => `git${' --git-dir'.repeat(count)} stash`;

const cpuUsage = process.threadCpuUsage ?? process.cpuUsage;

function cpuMilliseconds() {
  const { user, system } = cpuUsage();
  return (user + system) / 1000;
}

function cpuTime(action) {
  const start = cpuMilliseconds();
  action();
  return cpuMilliseconds() - start;
}

function bestTimes(smallAction, largeAction) {
  let small = Infinity;
  let large = Infinity;
  for (let run = 0; run < LINEAR_RUNS; run += 1) {
    small = Math.min(small, cpuTime(smallAction));
    large = Math.min(large, cpuTime(largeAction));
  }
  return { small, large };
}

function decideAllGitCommands(sharesGitState, count, repeats = 1) {
  const allowed = allowedGitCommands(count);
  const denied = deniedGitCommand(count);
  return () => {
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      allowed.forEach((command) => sharesGitState(command));
      sharesGitState(denied);
    }
  };
}

test('deciding a long run of git global options grows linearly with its length', async () => {
  const { sharesGitState } = await import('../lib/git-deny.mjs');
  allowedGitCommands(LINEAR_SMALL).forEach((command) => assert.equal(sharesGitState(command), false, command.slice(0, 40)));
  assert.equal(sharesGitState(deniedGitCommand(LINEAR_SMALL)), true);
  const smallRepeated = decideAllGitCommands(sharesGitState, LINEAR_SMALL, LINEAR_GROWTH);
  smallRepeated();
  const times = bestTimes(smallRepeated, decideAllGitCommands(sharesGitState, LINEAR_SMALL * LINEAR_GROWTH));
  const small = times.small / LINEAR_GROWTH;
  const large = times.large;
  const ratio = large / Math.max(small, 0.05);
  assert.ok(ratio < LINEAR_MAX_RATIO, `${LINEAR_GROWTH}x the options took ${ratio.toFixed(1)}x the time (${small.toFixed(2)} ms to ${large.toFixed(2)} ms)`);
});

function progressPointer(source, { ageMs = 0, env = {}, files = ['topic/progress.md'] } = {}) {
  const configHome = tempDir('exo-progress-config-');
  const project = tempDir('exo-progress-project-');
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const hookEnv = { ...process.env, CLAUDE_CONFIG_DIR: configHome, CLAUDE_PLUGIN_ROOT: REPOSITORY, ...env };
  for (const name of ['CODEX_HOME', 'EXO_HOST', 'EXO_RUN_DIR']) delete hookEnv[name];
  files.forEach((file, index) => {
    const target = path.join(project, '.exo', file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'progress');
    const stamp = new Date(Date.now() - ageMs - index * 1000);
    fs.utimesSync(target, stamp, stamp);
  });
  const output = JSON.parse(execFileSync(process.execPath, [hook], { env: hookEnv, input: JSON.stringify({ session_id: 's1', source, cwd: project }) }).toString());
  return output.hookSpecificOutput.additionalContext;
}

test('the session hook names a fresh progress file after a compact, clear or resume only', () => {
  for (const source of ['compact', 'clear', 'resume']) {
    const context = progressPointer(source);
    assert.match(context, /A progress file sits at `[^`]*\.exo\/topic\/progress\.md`\. Read it only when this session continues that work\./, source);
  }
  for (const source of ['startup', 'fork']) assert.doesNotMatch(progressPointer(source), /A progress file sits at/, source);
});

test('the session hook names the newest progress file one level under .exo and skips deeper ones', () => {
  const context = progressPointer('compact', { files: ['run-plan/id/stamp/progress.md', 'newer/progress.md', 'older/progress.md'] });
  assert.match(context, /\.exo\/newer\/progress\.md/);
  assert.doesNotMatch(context, /run-plan/);
});

test('the session hook skips a progress file older than EXO_PROGRESS_POINTER_MS and honours a shorter window', () => {
  assert.doesNotMatch(progressPointer('compact', { ageMs: 3700000 }), /A progress file sits at/);
  assert.match(progressPointer('compact', { ageMs: 3500000 }), /A progress file sits at/);
  assert.doesNotMatch(progressPointer('compact', { ageMs: 120000, env: { EXO_PROGRESS_POINTER_MS: '60000' } }), /A progress file sits at/);
});

test('the session hook names no progress file when none exists', () => {
  assert.doesNotMatch(progressPointer('clear', { files: [] }), /A progress file sits at/);
});

test('hooks/session-rules.md states the irreversible-step rule and the safe-default rule once each', () => {
  const text = fs.readFileSync(path.join(REPOSITORY, 'hooks', 'session-rules.md'), 'utf8');
  assert.equal(text.split('irreversible').length - 1, 1, 'irreversible');
  assert.equal(text.split('has a safe default').length - 1, 1, 'has a safe default');
  assert.equal(text.split('no safe default').length - 1, 1, 'no safe default');
});

test('the dispatch rules state the sized-brief lines, the read budget and the split', () => {
  const rules = fs.readFileSync(path.join(REPOSITORY, 'hooks', 'dispatch-rules.md'), 'utf8');
  assert.match(rules, /`Reads:` line[^\n]*`Fetches: <n>`[^\n]*30k tokens[^\n]*split into more agents/);
});

test('the dispatch rules add the Workers line, the slice plan, the worker Reads line and the wait', () => {
  const rules = fs.readFileSync(path.join(REPOSITORY, 'hooks', 'dispatch-rules.md'), 'utf8');
  assert.match(rules, /unnamed worker brief a `Reads:` or `Fetches:` line/);
  assert.match(rules, /more than 4 workers[^\n]*`Workers: <n>` line of at most 4[^\n]*in parallel[^\n]*next slice's `Reads:`/);
  assert.match(rules, /end the turn and wait for the notification/);
});

test('the script-size step reads its cap from defaults.scriptBytes', async () => {
  const { SCRIPT_SIZE_STEP } = await import('../hooks/dispatch-bash.mjs');
  const { scriptBytes } = await import('../lib/context-limits.mjs');
  const limit = scriptBytes();
  const run = (size) => SCRIPT_SIZE_STEP.run({ agent_id: 'a', tool_input: { command: 'x'.repeat(size) } });
  assert.equal(run(limit), null);
  const denied = run(limit + 1);
  assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(denied.hookSpecificOutput.permissionDecisionReason, new RegExp(`over ${limit} bytes`));
});

test('an orchestrator Bash command runs within the pre-dispatch read cap and is denied past it until its first dispatch', async () => {
  const { PREDISPATCH_STEP } = await import('../hooks/dispatch-bash.mjs');
  const { recordSlice } = await import('../lib/slice-state.mjs');
  const { orchestratorPredispatchReads } = await import('../lib/context-limits.mjs');
  const agentId = `predispatch-${process.pid}`;
  const input = (agentType) => ({ agent_id: agentId, agent_type: agentType, tool_input: { command: 'ls' } });
  for (let call = 0; call < orchestratorPredispatchReads() + 1; call += 1) assert.equal(PREDISPATCH_STEP.run(input('exo:orchestrator')), null);
  const denied = PREDISPATCH_STEP.run(input('exo:orchestrator'));
  assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(denied.hookSpecificOutput.permissionDecisionReason, /Bash calls before its first dispatch/);
  assert.equal(PREDISPATCH_STEP.run(input('exo:task-runner')), null);
  recordSlice(agentId);
  assert.equal(PREDISPATCH_STEP.run(input('exo:orchestrator')), null);
  for (const kind of ['slice', 'predispatch']) fs.rmSync(path.join(os.tmpdir(), `exo-${kind}-${agentId}`), { force: true });
});

test('the sleep step denies sleep in command position for an orchestrator or task-runner', async () => {
  const { SLEEP_STEP } = await import('../hooks/dispatch-bash.mjs');
  const run = (agentType, command) => SLEEP_STEP.run({ agent_id: 'a', agent_type: agentType, tool_input: { command } });
  for (const command of ['sleep 30', 'ls && sleep 5', 'node x.mjs; sleep 1']) {
    const denied = run('exo:task-runner', command);
    assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny', command);
    assert.match(denied.hookSpecificOutput.permissionDecisionReason, /notification[\s\S]*wait-report\.mjs/);
  }
  assert.equal(run('exo:orchestrator', 'sleep 2').hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(run('exo:task-runner', 'grep sleep file.txt'), null);
  assert.equal(run('exo:task-runner', 'node sleep.test.mjs'), null);
  assert.equal(run('exo:build-task', 'sleep 5'), null);
});

async function cappedRun(command, extra = {}) {
  const { dispatchBash } = await import('../hooks/dispatch-bash.mjs');
  const hookInput = { hook_event_name: 'PreToolUse', tool_name: 'Bash', agent_id: 'cap-agent', agent_type: 'general-purpose', permission_mode: 'bypassPermissions', tool_input: { command }, ...extra };
  const output = await dispatchBash(hookInput, undefined, () => false);
  const rewritten = output?.hookSpecificOutput?.updatedInput?.command;
  assert.ok(rewritten, command);
  const run = spawnSync('bash', ['-c', rewritten], { encoding: 'utf8', cwd: os.tmpdir() });
  return { stdout: run.stdout, status: run.status, rewritten };
}

const BIG_OUTPUT = 'head -c 9000 /dev/zero | tr "\\0" x';

const CAP_FORMS = {
  plain: BIG_OUTPUT,
  pipe: `${BIG_OUTPUT} | cat`,
  'inner redirect': `${BIG_OUTPUT} > /dev/null; ${BIG_OUTPUT}`,
  heredoc: `cat <<EOT\n$(${BIG_OUTPUT})\nEOT`,
  'trailing comment': `${BIG_OUTPUT} # note`,
  exec: `exec ${BIG_OUTPUT.split(' | ')[0]}`,
  cd: `cd /tmp && ${BIG_OUTPUT}`,
  background: `${BIG_OUTPUT} & wait`
};

test('a capped agent Bash output is cut at the result cap and keeps the exit code', async () => {
  for (const [form, command] of Object.entries(CAP_FORMS)) {
    const { stdout } = await cappedRun(command);
    assert.match(stdout, /^[\s\S]{4096}\[output cut at 4096 bytes; full log: .*exo-bash-cap-agent-.*\.log\]\n$/, form);
    assert.ok(Buffer.byteLength(stdout) < 4096 + 400, form);
  }
  assert.equal((await cappedRun('echo hi; exit 7')).status, 7);
  assert.equal((await cappedRun('exit 3')).status, 3);
  assert.equal((await cappedRun('echo hi')).stdout, 'hi\n');
});

test('the SessionStart hook sweeps saved Bash outputs older than EXO_SAVED_OUTPUT_MS and keeps newer ones', () => {
  const folder = tempDir('exo-sweep-');
  fs.mkdirSync(path.join(folder, 'exo-bash'));
  const [old, fresh, other] = ['exo-bash-agent-old.log', 'exo-bash-agent-new.log', 'other.log'].map((name) => path.join(folder, 'exo-bash', name));
  for (const file of [old, fresh, other]) fs.writeFileSync(file, 'x');
  const twoDaysAgo = (Date.now() - 2 * 86400000) / 1000;
  for (const file of [old, other]) fs.utimesSync(file, twoDaysAgo, twoDaysAgo);
  const env = { ...process.env, TMPDIR: folder, CLAUDE_CONFIG_DIR: path.join(folder, 'config'), EXO_RUN_DIR: folder };
  const run = spawnSync('node', [path.join(REPOSITORY, 'hooks', 'session-start.mjs')], { input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: folder }), encoding: 'utf8', env });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(fresh), true);
  assert.equal(fs.existsSync(other), true);
});

test('the context-limit entry starts node only for Read, Skill, a run session or an agent past its soft limit', () => {
  const { command } = hookEntries().find((entry) => entry.matcher?.startsWith('Read|')).hook;
  const folder = tempDir('exo-gate-');
  const traced = (input, extra = {}) => {
    const env = { ...process.env, TMPDIR: folder, CLAUDE_PLUGIN_ROOT: REPOSITORY };
    delete env.EXO_RUN_HANDOFF;
    Object.assign(env, extra);
    const run = spawnSync('bash', ['-xc', command], { input: JSON.stringify(input), encoding: 'utf8', env });
    assert.equal(run.status, 0, run.stderr);
    return run.stderr.includes('hooks/context-limit.mjs');
  };
  assert.equal(traced({ tool_name: 'Grep', tool_input: {} }), false);
  assert.equal(traced({ tool_name: 'mcp__x__y', agent_id: 'gate-a', tool_input: {} }), false);
  assert.equal(traced({ tool_name: 'Read', tool_input: { file_path: '/nonexistent' } }), true);
  assert.equal(traced({ tool_name: 'Skill', tool_input: { skill: 'exo:build' } }), true);
  assert.equal(traced({ tool_name: 'Grep', tool_input: {} }, { EXO_RUN_HANDOFF: path.join(folder, 'handoff.md') }), true);
  fs.writeFileSync(path.join(folder, 'exo-context-gate-a'), '1');
  assert.equal(traced({ tool_name: 'mcp__x__y', agent_id: 'gate-a', tool_input: {} }), true);
});

test('a capped agent Bash keeps a timeout and skips background, trailing backslash, other modes and other types', async () => {
  const { dispatchBash } = await import('../hooks/dispatch-bash.mjs');
  const timed = await cappedRun(`timeout 5 ${BIG_OUTPUT}`);
  assert.match(timed.stdout, /output cut at 4096/);
  const skipped = [
    { tool_input: { command: 'echo hi', run_in_background: true } },
    { tool_input: { command: 'echo hi \\' } },
    { permission_mode: 'default' },
    { agent_type: 'task-runner' },
    { agent_id: undefined, agent_type: undefined }
  ];
  for (const extra of skipped) {
    const hookInput = { hook_event_name: 'PreToolUse', tool_name: 'Bash', agent_id: 'cap-agent', agent_type: 'general-purpose', permission_mode: 'bypassPermissions', tool_input: { command: 'echo hi' }, ...extra };
    const output = await dispatchBash(hookInput, undefined, () => false);
    assert.doesNotMatch(output?.hookSpecificOutput?.updatedInput?.command ?? '', /output log/, JSON.stringify(extra));
  }
});

test('the session hook makes an unmatched zsh glob pass through by one line in CLAUDE_ENV_FILE', () => {
  const home = tempDir('exo-env-file-');
  const envFile = path.join(home, 'sessionstart-hook-0.sh');
  const hook = path.join(REPOSITORY, 'hooks', 'session-start.mjs');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: home, CLAUDE_ENV_FILE: envFile, EXO_RUN_DIR: home };
  for (let run = 0; run < 2; run += 1) execFileSync(process.execPath, [hook], { env, input: JSON.stringify({ session_id: 's1', source: 'startup' }) });
  const lines = fs.readFileSync(envFile, 'utf8').split('\n').filter((line) => line.includes('nonomatch'));
  assert.equal(lines.length, 1);
  for (const shell of ['zsh', 'bash'].filter((name) => spawnSync(name, ['-c', 'exit 0']).status === 0)) {
    const result = spawnSync(shell, ['-c', `. '${envFile}'; eval 'echo --include=*.exo-no-match'`], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${shell}: ${result.stderr}`);
    assert.equal(result.stdout, '--include=*.exo-no-match\n', shell);
    assert.equal(result.stderr, '', shell);
  }
});
