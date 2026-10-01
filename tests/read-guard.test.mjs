// The read guard refuses an unbounded read of a large file and a second read
// of a range unchanged since the first, and stands down when the `guards`
// setting is off; the `guard_lines` setting moves the limit.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, gitRepository, run } from './harness.mjs';

const GUARD = fileURLToPath(new URL('../hooks/guards/read-guard.mjs', import.meta.url));
const REPO_MAP = fileURLToPath(new URL('../skills/spec/scripts/repo-map.mjs', import.meta.url));
const OVER_CAP = Array.from({ length: 600 }, (_, index) => `line ${index + 1}`).join('\n');

function runGuard(args, hookInput, env) {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [GUARD, ...args],
      { env: { ...process.env, ...env }, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    );
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(hookInput));
  });
}

// `settings` is written to the project's .claude/exo.json, where the guard
// resolves its `guards` and `guard_lines` settings.
async function guardFixture(settings = null) {
  const configDirectory = await fixture();
  const projectDirectory = path.join(configDirectory, 'project');
  await fs.mkdir(path.join(projectDirectory, '.claude'), { recursive: true });
  if (settings !== null) await fs.writeFile(path.join(projectDirectory, '.claude', 'exo.json'), JSON.stringify(settings));
  const file = path.join(configDirectory, 'big.ts');
  await fs.writeFile(file, Array.from({ length: 600 }, (_, index) => `line ${index + 1}`).join('\n'));
  return { env: { CLAUDE_CONFIG_DIR: configDirectory, CLAUDE_PROJECT_DIR: projectDirectory }, configDirectory, file };
}

function readInput(file, range = {}, toolUseId = 'toolu_1') {
  return { session_id: 's1', tool_name: 'Read', tool_use_id: toolUseId, tool_input: { file_path: file, ...range } };
}

async function record(configDirectory) {
  return JSON.parse(await fs.readFile(path.join(configDirectory, 'exo', 'sessions', 's1.json'), 'utf8'));
}

function decision(result) {
  return result.stdout === '' ? null : JSON.parse(result.stdout).hookSpecificOutput;
}

test('refuses an unbounded read of a file over 400 lines', async () => {
  const { env, configDirectory, file } = await guardFixture();
  const result = await runGuard([], readInput(file), env);
  assert.equal(result.code, 0, result.stderr);
  const verdict = decision(result);
  assert.equal(verdict.hookEventName, 'PreToolUse');
  assert.equal(verdict.permissionDecision, 'deny');
  assert.match(verdict.permissionDecisionReason, /has 600 lines and a read above 400 lines is refused \(this one asks the whole file\)/);
});

test('a booked ranged read is refused on an unchanged re-read with the earlier bytes, and a change lets it through', async () => {
  const { env, configDirectory, file } = await guardFixture();
  const ranged = readInput(file, { offset: 100, limit: 50 });
  assert.equal(decision(await runGuard([], ranged, env)), null);
  assert.equal((await runGuard(['book'], ranged, env)).stdout, '');
  const repeat = decision(await runGuard([], readInput(file, { offset: 100, limit: 50 }, 'toolu_9'), env));
  assert.equal(repeat.permissionDecision, 'deny');
  assert.match(repeat.permissionDecisionReason, /is unchanged since your read at/);
  const session = await record(configDirectory);
  assert.deepEqual(Object.keys(session), ['reads', 'calls']);
  assert.equal(Object.keys(session.reads).length, 1);

  await fs.appendFile(file, '\nline 601');
  assert.equal(decision(await runGuard([], ranged, env)), null);
});

test('a read that never succeeded is not a duplicate', async () => {
  const { env, file } = await guardFixture();
  const ranged = readInput(file, { offset: 100, limit: 50 });
  assert.equal(decision(await runGuard([], ranged, env)), null);
  assert.equal(decision(await runGuard([], ranged, env)), null);
});

test('an offset without a limit is refused like an unbounded read, and the reason offers no limit above the cap', async () => {
  const { env, file } = await guardFixture();
  const verdict = decision(await runGuard([], readInput(file, { offset: 1 }), env));
  assert.equal(verdict?.permissionDecision, 'deny');
  assert.match(verdict.permissionDecisionReason, /has 600 lines and a read above 400 lines is refused \(this one asks the whole file\)/);
  assert.doesNotMatch(verdict.permissionDecisionReason, /pass limit explicitly/);
});

test('a limit above the cap is refused like an unbounded read, a limit at the cap passes', async () => {
  const { env, file } = await guardFixture();
  const verdict = decision(await runGuard([], readInput(file, { limit: 600 }), env));
  assert.equal(verdict?.permissionDecision, 'deny');
  assert.match(verdict.permissionDecisionReason, /a read above 400 lines is refused \(this one asks 600\)/);
  assert.equal(decision(await runGuard([], readInput(file, { limit: 400 }, 'toolu_2'), env)), null);
});

test('a limit above a lowered guard_lines is refused', async () => {
  const { env, file } = await guardFixture({ guard_lines: 100 });
  const verdict = decision(await runGuard([], readInput(file, { offset: 1, limit: 200 }), env));
  assert.equal(verdict?.permissionDecision, 'deny');
  assert.equal(decision(await runGuard([], readInput(file, { offset: 1, limit: 100 }, 'toolu_2'), env)), null);
});

test('guards off never refuses, and a missing or binary file passes', async () => {
  const off = await guardFixture({ guards: 'off' });
  const offResult = await runGuard([], readInput(off.file), off.env);
  assert.equal(offResult.code, 0, offResult.stderr);
  assert.equal(decision(offResult), null);
  const on = await guardFixture();
  assert.equal(decision(await runGuard([], readInput(path.join(on.configDirectory, 'absent.ts')), on.env)), null);
  assert.equal(decision(await runGuard([], readInput(path.join(on.configDirectory, 'shot.png')), on.env)), null);
});

test('reset forgets the reads so the next identical read passes', async () => {
  const { env, configDirectory, file } = await guardFixture();
  const ranged = readInput(file, { offset: 1, limit: 20 });
  await runGuard(['book'], ranged, env);
  await runGuard(['reset'], { session_id: 's1', source: 'compact' }, env);
  assert.deepEqual((await record(configDirectory)).reads, {});
  assert.equal(decision(await runGuard([], ranged, env)), null);
});

test('a delegate reading a range the main thread already read passes', async () => {
  const { env, file } = await guardFixture();
  const ranged = readInput(file, { offset: 1, limit: 20 });
  await runGuard(['book'], ranged, env);
  const delegated = { ...ranged, agent_id: 'a1' };
  assert.equal(decision(await runGuard([], delegated, env)), null);
  await runGuard(['book'], delegated, env);
  const repeat = decision(await runGuard([], delegated, env));
  assert.equal(repeat.permissionDecision, 'deny');
});

test('a one-line file over 200 bytes per allowed line is refused unbounded, a bounded read and a file at the byte cap pass', async () => {
  const { env, configDirectory } = await guardFixture();
  const minified = path.join(configDirectory, 'bundle.min.js');
  await fs.writeFile(minified, 'x'.repeat(80_001));
  const verdict = decision(await runGuard([], readInput(minified), env));
  assert.equal(verdict?.permissionDecision, 'deny');
  assert.match(verdict.permissionDecisionReason, /has 80001 bytes and an unbounded read above 80000 bytes/);
  assert.equal(decision(await runGuard([], readInput(minified, { offset: 1, limit: 50 }, 'toolu_2'), env)), null);
  const atCap = path.join(configDirectory, 'at-cap.js');
  await fs.writeFile(atCap, 'x'.repeat(80_000));
  assert.equal(decision(await runGuard([], readInput(atCap), env)), null);
  const lowered = await guardFixture({ guard_lines: 100 });
  const loweredFile = path.join(lowered.configDirectory, 'bundle.min.js');
  await fs.writeFile(loweredFile, 'x'.repeat(20_001));
  assert.match(decision(await runGuard([], readInput(loweredFile), lowered.env)).permissionDecisionReason, /above 20000 bytes/);
});

test('a file of exactly 400 lines with a final newline passes an unbounded read', async () => {
  const { env, configDirectory } = await guardFixture();
  const file = path.join(configDirectory, 'four-hundred.ts');
  await fs.writeFile(file, Array.from({ length: 400 }, (_, index) => `line ${index + 1}\n`).join(''));
  assert.equal(decision(await runGuard([], readInput(file), env)), null);
});

test('guard_lines moves the big-file limit, and a value that is not a whole number keeps 400', async () => {
  const raised = await guardFixture({ guard_lines: 800 });
  assert.equal(decision(await runGuard([], readInput(raised.file), raised.env)), null);
  const lowered = await guardFixture({ guard_lines: 100 });
  const loweredVerdict = decision(await runGuard([], readInput(lowered.file), lowered.env));
  assert.match(loweredVerdict.permissionDecisionReason, /has 600 lines and a read above 100 lines is refused/);
  const broken = await guardFixture({ guard_lines: 'lots' });
  const brokenVerdict = decision(await runGuard([], readInput(broken.file), broken.env));
  assert.match(brokenVerdict.permissionDecisionReason, /a read above 400 lines is refused/);
  const fromHook = await guardFixture();
  const fromHookVerdict = decision(await runGuard([], readInput(fromHook.file), { ...fromHook.env, CLAUDE_PLUGIN_OPTION_GUARD_LINES: '100' }));
  assert.match(fromHookVerdict.permissionDecisionReason, /a read above 100 lines is refused/);
});

// The map the generator prints, filled past the cap. The path comes from the
// generator, so a map that moves fails this test instead of losing its
// exemption in silence.
async function repositoryMapOverCap(root) {
  const built = await run(REPO_MAP, [], { cwd: root });
  assert.equal(built.code, 0, built.stderr);
  const file = built.stdout.trim();
  await fs.writeFile(file, OVER_CAP);
  return file;
}

test('the repository map passes an unbounded read, and no other path in the repository does', async () => {
  const { env } = await guardFixture();
  const root = await gitRepository({ 'README.md': '# Fixture\n' });
  const map = await repositoryMapOverCap(root);
  assert.equal(decision(await runGuard([], { ...readInput(map), cwd: root }, env)), null);
  const beside = path.join(path.dirname(map), 'memory.md');
  await fs.writeFile(beside, OVER_CAP);
  const besideVerdict = decision(await runGuard([], { ...readInput(beside), cwd: root }, env));
  assert.match(besideVerdict.permissionDecisionReason, /memory\.md has 600 lines/);
  const tracked = path.join(root, 'exo', 'map.md');
  await fs.mkdir(path.dirname(tracked), { recursive: true });
  await fs.writeFile(tracked, OVER_CAP);
  const trackedVerdict = decision(await runGuard([], { ...readInput(tracked), cwd: root }, env));
  assert.match(trackedVerdict.permissionDecisionReason, /has 600 lines/);
});

test('the map is exempt through a symlinked path to the same repository', async () => {
  const { env } = await guardFixture();
  const root = await gitRepository({ 'README.md': '# Fixture\n' });
  const map = await repositoryMapOverCap(root);
  const link = path.join(await fixture(), 'linked-root');
  await fs.symlink(root, link);
  const throughLink = path.join(link, path.relative(root, map));
  assert.equal(decision(await runGuard([], { ...readInput(throughLink), cwd: link }, env)), null);
});

test('the map exemption is the cap alone: a second read of it in one context window is still refused', async () => {
  const { env } = await guardFixture();
  const root = await gitRepository({ 'README.md': '# Fixture\n' });
  const map = await repositoryMapOverCap(root);
  await runGuard(['book'], { ...readInput(map), cwd: root }, env);
  const repeat = decision(await runGuard([], { ...readInput(map), cwd: root }, env));
  assert.equal(repeat.permissionDecision, 'deny');
  assert.match(repeat.permissionDecisionReason, /unchanged since your read/);
});
