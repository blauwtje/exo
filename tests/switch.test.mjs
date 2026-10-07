// The session hook hands the model the route-skills body, the pointer to
// references/lean.md included, so it holds before every edit without a
// skill call. Every start rewrites the plugin-root pointer; only a clear or a compaction
// resets the read guard.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HOOK_OUTPUT_CAP } from '#budgets';
import { fixture, git, gitRepository } from './harness.mjs';

const HOOK = fileURLToPath(new URL('../hooks/session-start.mjs', import.meta.url));
const PLUGIN_ROOT = path.dirname(path.dirname(HOOK));
const LEAN_TEXTS = ['references/lean.md', 'Before a code edit, read `references/lean.md`'];

function runHookWith(env, source) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [HOOK], { env, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) }));
    child.stdin.end(JSON.stringify({ session_id: 's1', source }));
  });
}

function runHook(env, source = 'startup') {
  return runHookWith({ ...process.env, ...env }, source);
}

function runHookIn(env, cwd) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [HOOK], { env: { ...process.env, ...env }, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) }));
    child.stdin.end(JSON.stringify({ session_id: 's1', source: 'startup', cwd }));
  });
}

test('the session hook carries the pointer to references/lean.md', async () => {
  const configDirectory = await fixture();
  const result = await runHook({ CLAUDE_CONFIG_DIR: configDirectory });
  assert.equal(result.code, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.ok(context.includes('# Using exo'), context);
  for (const text of LEAN_TEXTS) assert.ok(context.includes(text), text);
  assert.ok(context.includes('An instruction in CLAUDE.md or the prompt outranks a skill.'), context);
  // The frontmatter is dropped, so the description never reaches the context twice.
  assert.ok(!context.includes('name: route-skills'), context);
});

test('a resumed session rewrites the plugin-root pointer and only a compaction resets the guards', async () => {
  const configDirectory = await fixture();
  const hotRecord = path.join(configDirectory, 'exo', 'sessions', 's1.json');
  const resumed = await runHook({ CLAUDE_CONFIG_DIR: configDirectory }, 'resume');
  assert.equal(resumed.code, 0, resumed.stderr);
  const pointer = await fs.readFile(path.join(configDirectory, 'exo', 'plugin-root'), 'utf8');
  assert.equal(pointer.trim(), PLUGIN_ROOT);
  assert.equal(await fs.access(hotRecord).catch(() => 'absent'), 'absent');
  await fs.mkdir(path.dirname(hotRecord), { recursive: true });
  await fs.writeFile(hotRecord, JSON.stringify({ reads: { 'main:/repo/a.ts:0:0': { bytes: 10 } }, calls: { 'main:Bash:abc': 2 } }));
  const compacted = await runHook({ CLAUDE_CONFIG_DIR: configDirectory }, 'compact');
  assert.equal(compacted.code, 0, compacted.stderr);
  const session = JSON.parse(await fs.readFile(hotRecord, 'utf8'));
  assert.deepEqual(session.reads, {});
  assert.deepEqual(session.calls, {});
});

test('with no tool on PATH the hook still injects the route-skills body and writes the plugin-root pointer', async () => {
  const configDirectory = await fixture();
  const emptyDirectory = await fixture();
  const result = await runHookWith({ PATH: emptyDirectory, CLAUDE_CONFIG_DIR: configDirectory }, 'startup');
  assert.equal(result.code, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.ok(context.includes('# Using exo'), context);
  const pointer = await fs.readFile(path.join(configDirectory, 'exo', 'plugin-root'), 'utf8');
  assert.equal(pointer.trim(), PLUGIN_ROOT);
});

test('the session hook leads with the settings line resolved for the project', async () => {
  const configDirectory = await fixture();
  const project = await fixture();
  await fs.mkdir(path.join(project, '.claude'));
  await fs.writeFile(path.join(project, '.claude', 'exo.json'), '{"specs":"issues"}\n');
  const result = await runHook({ CLAUDE_CONFIG_DIR: configDirectory, CLAUDE_PROJECT_DIR: project, CLAUDE_PLUGIN_OPTION_SPECS: '', CLAUDE_PLUGIN_OPTION_REPLIES: '', CLAUDE_PLUGIN_OPTION_CONTEXT: '' });
  assert.equal(result.code, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.ok(context.startsWith('exo settings: specs=issues (project), replies=tight (default), budget=medium (default), ship=ask (default), workspace=ask (default), guards=on (default), guard_lines=400 (default), heavy_after_seconds=60 (default), log_scan=off (default), sibling_scan=off (default). Replies are tight:'), context.slice(0, 200));
});

test('on a 60-character branch both pointers go first, named from the repository root', async () => {
  const configDirectory = await fixture();
  const repository = await gitRepository({ 'README.md': 'fixture\n' });
  const branch = `feature/${'b'.repeat(52)}`;
  assert.equal(branch.length, 60);
  git(repository, 'checkout', '-q', '-b', branch);
  const handoff = path.join(repository, '.git', 'exo', 'handoff', `${branch}.md`);
  await fs.mkdir(path.dirname(handoff), { recursive: true });
  await fs.writeFile(handoff, '# Handoff\n');
  await fs.writeFile(path.join(repository, '.git', 'exo', 'memory.md'), '# Project memory\n');
  const result = await runHookIn({ CLAUDE_CONFIG_DIR: configDirectory }, repository);
  assert.equal(result.code, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  const handoffPointer = `A handoff for \`${branch}\` sits at \`.git/exo/handoff/${branch}.md\` from the repository root.`;
  const memoryPointer = 'A project memory for this repository sits at `.git/exo/memory.md` from the repository root.';
  assert.ok(context.startsWith(handoffPointer), context.slice(0, 300));
  assert.ok(context.includes(memoryPointer), context.slice(0, 600));
  assert.ok(context.indexOf(memoryPointer) < context.indexOf('# Using exo'), 'the memory pointer follows the route-skills text');
  assert.ok(context.length <= HOOK_OUTPUT_CAP.chars, `${context.length} characters`);
});
