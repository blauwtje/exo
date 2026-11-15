import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { hookEntries, readHooks, REPOSITORY_ROOT as REPOSITORY, tempDir } from './harness.mjs';


import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';

delete process.env.EXO_PROVIDER;

const HOOKS = readHooks();
const PLUGIN_PATH = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\s]+)/g;

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
  assert.deepEqual(hookEntries().filter((entry) => entry.event === 'PreToolUse').map((entry) => entry.matcher), ['Bash', 'Agent', 'Read|Skill', 'AskUserQuestion']);
});

test('the AskUserQuestion hook runs the run-no-wait script', () => {
  const entries = hookEntries().filter((entry) => entry.matcher === 'AskUserQuestion');
  assert.deepEqual(entries.map((entry) => entry.event), ['PreToolUse']);
  for (const { hook } of entries) assert.ok(hook.command.endsWith('; node "${CLAUDE_PLUGIN_ROOT}/hooks/run-no-wait.mjs"'), hook.command);
});

test('only SessionStart and PreToolUse have hooks, and the prompt dispatcher and SubagentStop hook are gone', () => {
  assert.deepEqual(Object.keys(HOOKS).sort(), ['PreToolUse', 'SessionStart']);
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

test('the plugin registers five hook commands, each under bash', () => {
  const entries = hookEntries();
  assert.equal(entries.length, 5, JSON.stringify(entries.map((entry) => entry.hook.command)));
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

test('the session hook with no exo settings injects no reply rules, only the confirm line', () => {
  const context = sessionContext('exo-plain-');
  assert.ok(!context.includes('compression'));
  assert.ok(!context.includes('Say the answer first.'));
  assert.ok(!context.includes('one question per message'));
  assert.ok(context.includes('Ask the user only about the destructive step'));
});

test('the exo:adhd output style carries its frontmatter and each outranking rule', () => {
  const style = fs.readFileSync(path.join(REPOSITORY, 'output-styles', 'adhd.md'), 'utf8');
  assert.match(style, /^---\nname: adhd\ndescription: .+\nkeep-coding-instructions: true\n---\n/);
  for (const phrase of ['exactly as they are', 'every not, no, only and except', 'security warning in full sentences', 'ask the user to confirm', 'one question per message', 'reply entirely in the user\'s language', 'at most 3 bullets', 'lone `?`']) {
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
  fs.copyFileSync(path.join(REPOSITORY, 'hooks', 'session-start.mjs'), path.join(copy, 'hooks', 'session-start.mjs'));
  const messageFor = (engines) => {
    fs.writeFileSync(path.join(copy, 'package.json'), JSON.stringify({ type: 'module', engines, imports: manifest.imports }));
    return JSON.parse(execFileSync(process.execPath, [path.join(copy, 'hooks', 'session-start.mjs')], { env, input: '{}' }).toString()).systemMessage;
  };
  const current = Number(process.versions.node.split('.')[0]);
  assert.equal(messageFor({ node: `>=${current}` }), undefined);
  const warned = messageFor({ node: `>=${current + 1}` });
  assert.ok(warned.includes(`needs Node ${current + 1} or newer`) && warned.includes(`this is Node ${process.versions.node}`));
});

test('a subagent Bash call is denied a shared-state git command at command position, the lead and other commands are not', async () => {
  const { dispatchBash } = await import('../hooks/dispatch-bash.mjs');
  const decide = async (command, agentId) => {
    const output = await dispatchBash({ hook_event_name: 'PreToolUse', tool_name: 'Bash', agent_id: agentId, tool_input: { command } }, undefined, () => false);
    return output?.hookSpecificOutput?.permissionDecision;
  };
  const denied = ['git stash', 'git stash pop', 'git -C ../other worktree remove w', 'git worktree prune', 'git branch -D run', 'git branch -m old new', 'git branch --delete x', '(git worktree move a b)', 'git --no-pager stash', 'git -c k=v stash pop', 'git --git-dir=.git stash', 'git --git-dir x stash', 'git -C dir stash', 'git --work-tree w --no-pager worktree remove w', 'git worktree  remove w', 'git branch -q -D x', 'git branch -df x', 'git branch --force -d x', 'git branch -f -m a b', 'if git stash; then :; fi', '{ git stash; }', 'time git stash', 'x=`git stash`', 'echo ok | git stash', 'if true; then git stash; fi', 'git branch run -D', 'git branch run -d', 'git branch old -m new', 'git branch --del x', 'git branch --de x', 'git branch --d x', 'git branch -f -D x', '! git stash', 'exec git stash', 'command git stash', 'env git stash', 'env A=1 git stash', 'sudo git stash', 'git stash>/dev/null', 'git worktree prune>/dev/null', 'git 2>/dev/null stash', 'git >log branch -D x'];
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

function decideAllGitCommands(sharedStateReason, count, repeats = 1) {
  const allowed = allowedGitCommands(count);
  const denied = deniedGitCommand(count);
  return () => {
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      allowed.forEach((command) => sharedStateReason(command));
      sharedStateReason(denied);
    }
  };
}

test('deciding a long run of git global options grows linearly with its length', async () => {
  const { sharedStateReason } = await import('../lib/git-deny.mjs');
  allowedGitCommands(LINEAR_SMALL).forEach((command) => assert.equal(sharedStateReason(command) !== null, false, command.slice(0, 40)));
  assert.equal(sharedStateReason(deniedGitCommand(LINEAR_SMALL)) !== null, true);
  const smallRepeated = decideAllGitCommands(sharedStateReason, LINEAR_SMALL, LINEAR_GROWTH);
  smallRepeated();
  const times = bestTimes(smallRepeated, decideAllGitCommands(sharedStateReason, LINEAR_SMALL * LINEAR_GROWTH));
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

test('the sleep step notes sleep in command position for every subagent', async () => {
  const { SLEEP_STEP } = await import('../hooks/dispatch-bash.mjs');
  const run = (agentType, command) => SLEEP_STEP.run({ agent_id: 'a', agent_type: agentType, tool_input: { command } });
  for (const command of ['sleep 30', 'ls && sleep 5', 'node x.mjs; sleep 1']) {
    const noted = run('exo:task-runner', command);
    assert.equal(noted.hookSpecificOutput.permissionDecision, undefined, command);
    assert.match(noted.hookSpecificOutput.additionalContext, /subagent: start the long command in the background/);
  }
  assert.equal(run('exo:orchestrator', 'sleep 2').hookSpecificOutput.permissionDecision, undefined);
  assert.equal(run('exo:task-runner', 'grep sleep file.txt'), null);
  assert.equal(run('exo:task-runner', 'node sleep.test.mjs'), null);
  assert.equal(run('exo:build-task', 'sleep 5').hookSpecificOutput.permissionDecision, undefined);
});

test('the sleep step notes a background sleep polling loop for the lead too', async () => {
  const { SLEEP_STEP } = await import('../hooks/dispatch-bash.mjs');
  const run = (command) => SLEEP_STEP.run({ tool_input: { command } });
  for (const command of ['until [ -f done ]; do sleep 2; done', 'while ! grep -q ok log; do\n  sleep 5\ndone']) {
    const noted = run(command);
    assert.equal(noted.hookSpecificOutput.permissionDecision, undefined, command);
    assert.match(noted.hookSpecificOutput.additionalContext, /No sleep polling/);
  }
  const warned = run('sleep 2').hookSpecificOutput;
  assert.equal(warned.permissionDecision, undefined);
  assert.match(warned.additionalContext, /No sleep polling/);
});

const ROOM_BYTES = 4000;
const ROOM_TRANSCRIPT = path.join(tempDir('exo-room-'), 'agent.jsonl');
const { agentContextTarget, dispatchBytesPerToken } = await import('../lib/context-limits.mjs');
fs.writeFileSync(ROOM_TRANSCRIPT, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: agentContextTarget() - ROOM_BYTES / dispatchBytesPerToken() } } })}\n`);

async function cappedRun(command) {
  const { dispatchBash } = await import('../hooks/dispatch-bash.mjs');
  const hookInput = { hook_event_name: 'PreToolUse', tool_name: 'Bash', agent_id: 'cap-agent', agent_type: 'general-purpose', permission_mode: 'bypassPermissions', agent_transcript_path: ROOM_TRANSCRIPT, tool_input: { command } };
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

test('a result file named with report, summary or findings is not a result file, so the harness Write guard never refuses it', async () => {
  const { briefResultKind } = await import('../lib/worker-size.mjs');
  for (const name of ['report', 'summary', 'findings', 'Review-Findings', 'run-summary']) {
    assert.equal(briefResultKind(`Result: .exo/x/${name}.md`), 'none', name);
  }
  assert.equal(briefResultKind('Result: .exo/consolidate/detail.md'), 'file');
});
