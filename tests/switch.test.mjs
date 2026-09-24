// The session hook hands the model the using-exo body, the right-sizing ladder
// and its guards included, so the ladder holds before every edit without a
// skill call. The savings switch does not reach it: it silences the counter,
// the status line segment and the read guard, and the ladder rides either way.
// Every start rewrites the plugin-root pointer; only a clear or a compaction
// resets the read guard.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HOOK_OUTPUT_CAP } from '#budgets';
import { fixture, git, gitRepository } from './harness.mjs';

const HOOK = fileURLToPath(new URL('../hooks/session-start.sh', import.meta.url));
const PLUGIN_ROOT = path.dirname(path.dirname(HOOK));
const LADDER_TEXTS = ['## The ladder', '## Never on the ladder', 'edit in the same turn'];

function runHookWith(bash, env, source) {
  return new Promise((resolve) => {
    const child = execFile(bash, [HOOK], { env, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) }));
    child.stdin.end(JSON.stringify({ session_id: 's1', source }));
  });
}

function runHook(env, source = 'startup') {
  return runHookWith('bash', { ...process.env, ...env }, source);
}

function runHookIn(env, cwd) {
  return new Promise((resolve) => {
    const child = execFile('bash', [HOOK], { env: { ...process.env, ...env }, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) }));
    child.stdin.end(JSON.stringify({ session_id: 's1', source: 'startup', cwd }));
  });
}

function toolPath(tool) {
  return new Promise((resolve, reject) => {
    execFile('bash', ['-c', `command -v ${tool}`], (error, stdout) => (error ? reject(error) : resolve(String(stdout).trim())));
  });
}

function jqAvailable() {
  return new Promise((resolve) => execFile('jq', ['--version'], (error) => resolve(!error)));
}

const withoutJq = !(await jqAvailable()) && 'jq not on PATH';

test('the session hook carries the right-sizing ladder whether exo savings are on or off', { skip: withoutJq }, async () => {
  const configDirectory = await fixture();
  const on = await runHook({ CLAUDE_CONFIG_DIR: configDirectory });
  assert.equal(on.code, 0, on.stderr);
  const off = await runHook({ CLAUDE_CONFIG_DIR: configDirectory, EXO_SAVINGS: 'off' });
  assert.equal(off.code, 0, off.stderr);
  for (const result of [on, off]) {
    const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
    assert.ok(context.includes('# Using exo'), context);
    for (const text of LADDER_TEXTS) assert.ok(context.includes(text), text);
    assert.ok(context.includes('`research`, `designing` and `skills-tool` hand control back to a stage that borrowed them and own the turn alone.'), context);
    // The frontmatter is dropped, so the description never reaches the context twice.
    assert.ok(!context.includes('name: using-exo'), context);
  }
});

test('a resumed session rewrites the plugin-root pointer and only a compaction resets the guards', { skip: withoutJq }, async () => {
  const configDirectory = await fixture();
  const record = path.join(configDirectory, 'exo', 'savings', 'sessions.json');
  const hotRecord = path.join(configDirectory, 'exo', 'savings', 'sessions', 's1.json');
  const resumed = await runHook({ CLAUDE_CONFIG_DIR: configDirectory }, 'resume');
  assert.equal(resumed.code, 0, resumed.stderr);
  const pointer = await fs.readFile(path.join(configDirectory, 'exo', 'plugin-root'), 'utf8');
  assert.equal(pointer.trim(), PLUGIN_ROOT);
  assert.equal(await fs.access(record).catch(() => 'absent'), 'absent');
  assert.equal(await fs.access(hotRecord).catch(() => 'absent'), 'absent');
  await fs.mkdir(path.dirname(hotRecord), { recursive: true });
  await fs.writeFile(hotRecord, JSON.stringify({ reads: { 'main:/repo/a.ts:0:0': { bytes: 10 } }, calls: { 'main:Bash:abc': 2 } }));
  const compacted = await runHook({ CLAUDE_CONFIG_DIR: configDirectory }, 'compact');
  assert.equal(compacted.code, 0, compacted.stderr);
  const session = JSON.parse(await fs.readFile(hotRecord, 'utf8'));
  assert.deepEqual(session.reads, {});
  assert.deepEqual(session.calls, {});
});

test('without jq the hook still writes the plugin-root pointer and exits 0 with a notice', async () => {
  const configDirectory = await fixture();
  const binDirectory = await fixture();
  for (const tool of ['cat', 'dirname', 'mkdir']) {
    await fs.symlink(await toolPath(tool), path.join(binDirectory, tool));
  }
  const bash = await toolPath('bash');
  const result = await runHookWith(bash, { PATH: binDirectory, CLAUDE_CONFIG_DIR: configDirectory }, 'startup');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /exo: jq not on PATH, using-exo not injected/);
  const pointer = await fs.readFile(path.join(configDirectory, 'exo', 'plugin-root'), 'utf8');
  assert.equal(pointer.trim(), PLUGIN_ROOT);
});

test('the session hook leads with the settings line resolved for the project', { skip: withoutJq }, async () => {
  const configDirectory = await fixture();
  const project = await fixture();
  await fs.mkdir(path.join(project, '.claude'));
  await fs.writeFile(path.join(project, '.claude', 'exo.json'), '{"specs":"issues"}\n');
  const result = await runHook({ CLAUDE_CONFIG_DIR: configDirectory, CLAUDE_PROJECT_DIR: project, CLAUDE_PLUGIN_OPTION_SPECS: '', CLAUDE_PLUGIN_OPTION_REPLIES: '', CLAUDE_PLUGIN_OPTION_CONTEXT: '' });
  assert.equal(result.code, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.ok(context.startsWith('exo settings: specs=issues (project), replies=tight (default), interview=chat (default), context=80 (default). Replies are tight:'), context.slice(0, 200));
});

test('on a 60-character branch both pointers go first, named from the repository root', { skip: withoutJq }, async () => {
  const configDirectory = await fixture();
  const repository = await gitRepository({ 'README.md': 'fixture\n' });
  const branch = `feature/${'b'.repeat(52)}`;
  assert.equal(branch.length, 60);
  git(repository, 'checkout', '-q', '-b', branch);
  const handoff = path.join(repository, '.git', 'exo', 'handoff', `${branch}.md`);
  await fs.mkdir(path.dirname(handoff), { recursive: true });
  await fs.writeFile(handoff, '# Handoff\n');
  await fs.writeFile(path.join(repository, '.git', 'exo', 'memory.md'), '# Project memory\n');
  const result = await runHookIn({ CLAUDE_CONFIG_DIR: configDirectory, EXO_SAVINGS: 'off' }, repository);
  assert.equal(result.code, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  const handoffPointer = `A handoff for \`${branch}\` sits at \`.git/exo/handoff/${branch}.md\` from the repository root.`;
  const memoryPointer = 'A project memory for this repository sits at `.git/exo/memory.md` from the repository root.';
  assert.ok(context.startsWith(handoffPointer), context.slice(0, 300));
  assert.ok(context.includes(memoryPointer), context.slice(0, 600));
  assert.ok(context.indexOf(memoryPointer) < context.indexOf('# Using exo'), 'the memory pointer follows the using-exo text');
  assert.ok(context.length <= HOOK_OUTPUT_CAP.chars, `${context.length} characters`);
});
