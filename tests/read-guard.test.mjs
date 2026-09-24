// The read guard refuses an unbounded read of a large file and a second read
// of a range unchanged since the first, books each refusal under its tool
// call with the bytes it kept out of context, books its own run time, and
// stands down only when config.json says readGuard: false.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, gitRepository, run } from './harness.mjs';

const GUARD = fileURLToPath(new URL('../skills/savings/scripts/read-guard.mjs', import.meta.url));
const REPO_MAP = fileURLToPath(new URL('../skills/planning/scripts/repo-map.mjs', import.meta.url));
const OVER_CAP = Array.from({ length: 600 }, (_, index) => `line ${index + 1}`).join('\n');

function runGuard(args, hookInput, env) {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [GUARD, ...args],
      { env: { ...process.env, ...env }, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    );
    child.stdin.end(JSON.stringify(hookInput));
  });
}

async function guardFixture(config = null) {
  const configDirectory = await fixture();
  if (config !== null) {
    await fs.mkdir(path.join(configDirectory, 'exo', 'savings'), { recursive: true });
    await fs.writeFile(path.join(configDirectory, 'exo', 'savings', 'config.json'), JSON.stringify(config));
  }
  const file = path.join(configDirectory, 'big.ts');
  await fs.writeFile(file, Array.from({ length: 600 }, (_, index) => `line ${index + 1}`).join('\n'));
  return { env: { CLAUDE_CONFIG_DIR: configDirectory }, configDirectory, file };
}

function readInput(file, range = {}, toolUseId = 'toolu_1') {
  return { session_id: 's1', tool_name: 'Read', tool_use_id: toolUseId, tool_input: { file_path: file, ...range } };
}

async function record(configDirectory) {
  return JSON.parse(await fs.readFile(path.join(configDirectory, 'exo', 'savings', 'sessions.json'), 'utf8'));
}

function decision(result) {
  return result.stdout === '' ? null : JSON.parse(result.stdout).hookSpecificOutput;
}

test('refuses an unbounded read of a file over 400 lines and books the whole file under the tool call', async () => {
  const { env, configDirectory, file } = await guardFixture();
  const result = await runGuard([], readInput(file), env);
  assert.equal(result.code, 0, result.stderr);
  const verdict = decision(result);
  assert.equal(verdict.hookEventName, 'PreToolUse');
  assert.equal(verdict.permissionDecision, 'deny');
  assert.match(verdict.permissionDecisionReason, /has 600 lines and an unbounded read is capped at 400/);
  const session = (await record(configDirectory)).s1;
  assert.deepEqual(Object.keys(session.guard.refusals), ['toolu_1']);
  const wholeFile = Buffer.byteLength(await fs.readFile(file, 'utf8'));
  assert.deepEqual(session.guard.refusals.toolu_1, { kind: 'capped', bytesWithheld: wholeFile, reader: 'main', filePath: file, open: true });
});

test('a later read of a capped file by the same reader gives its bytes back, until a reset closes the refusal', async () => {
  const { env, configDirectory, file } = await guardFixture();
  await runGuard([], readInput(file), env);
  const wholeFile = Buffer.byteLength(await fs.readFile(file, 'utf8'));
  const ranged = readInput(file, { offset: 1, limit: 50 }, 'toolu_2');
  await runGuard(['book'], ranged, env);
  const rangeBytes = Buffer.byteLength(Array.from({ length: 50 }, (_, index) => `line ${index + 1}`).join('\n'));
  assert.equal((await record(configDirectory)).s1.guard.refusals.toolu_1.bytesWithheld, wholeFile - rangeBytes);
  await runGuard(['book'], { ...ranged, agent_id: 'a1' }, env);
  assert.equal((await record(configDirectory)).s1.guard.refusals.toolu_1.bytesWithheld, wholeFile - rangeBytes);
  await runGuard(['reset'], { session_id: 's1', source: 'compact' }, env);
  await runGuard(['book'], readInput(file, { offset: 51, limit: 50 }, 'toolu_3'), env);
  const refusal = (await record(configDirectory)).s1.guard.refusals.toolu_1;
  assert.deepEqual([refusal.open, refusal.bytesWithheld], [false, wholeFile - rangeBytes]);
});

test('reads of a capped file never give back more than the refusal withheld', async () => {
  const { env, configDirectory, file } = await guardFixture();
  await runGuard([], readInput(file), env);
  await runGuard(['book'], readInput(file, { limit: 600 }, 'toolu_2'), env);
  await runGuard(['book'], readInput(file, { offset: 1, limit: 300 }, 'toolu_3'), env);
  assert.equal((await record(configDirectory)).s1.guard.refusals.toolu_1.bytesWithheld, 0);
});

test('every run that reaches the record books its own time, an allowed read included', async () => {
  const { env, configDirectory, file } = await guardFixture();
  assert.equal(decision(await runGuard([], readInput(file, { offset: 1, limit: 20 }), env)), null);
  const afterPre = (await record(configDirectory)).s1.guard.hookMs;
  assert.ok(afterPre > 0, `hookMs ${afterPre}`);
  await runGuard(['book'], readInput(file, { offset: 1, limit: 20 }), env);
  assert.ok((await record(configDirectory)).s1.guard.hookMs > afterPre);
});

test('a booked ranged read is refused on an unchanged re-read with the earlier bytes, and a change lets it through', async () => {
  const { env, configDirectory, file } = await guardFixture();
  const ranged = readInput(file, { offset: 100, limit: 50 });
  assert.equal(decision(await runGuard([], ranged, env)), null);
  assert.equal((await runGuard(['book'], ranged, env)).stdout, '');
  const repeat = decision(await runGuard([], readInput(file, { offset: 100, limit: 50 }, 'toolu_9'), env));
  assert.equal(repeat.permissionDecision, 'deny');
  assert.match(repeat.permissionDecisionReason, /is unchanged since your read at/);
  let session = (await record(configDirectory)).s1;
  assert.equal(session.guard.refusals.toolu_9.kind, 'duplicate');
  assert.equal(session.guard.refusals.toolu_9.bytesWithheld, session.reads[Object.keys(session.reads)[0]].bytes);

  await fs.appendFile(file, '\nline 601');
  assert.equal(decision(await runGuard([], ranged, env)), null);
  session = (await record(configDirectory)).s1;
  assert.deepEqual(Object.keys(session.guard.refusals), ['toolu_9']);
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
  assert.match(verdict.permissionDecisionReason, /has 600 lines and an unbounded read is capped at 400/);
  assert.doesNotMatch(verdict.permissionDecisionReason, /pass limit explicitly/);
});

test('a limit above the cap is refused like an unbounded read, a limit at the cap passes', async () => {
  const { env, file } = await guardFixture();
  const verdict = decision(await runGuard([], readInput(file, { limit: 600 }), env));
  assert.equal(verdict?.permissionDecision, 'deny');
  assert.equal(decision(await runGuard([], readInput(file, { limit: 400 }, 'toolu_2'), env)), null);
});

test('a limit above a lowered readGuardLines is refused', async () => {
  const { env, file } = await guardFixture({ readGuardLines: 100 });
  const verdict = decision(await runGuard([], readInput(file, { offset: 1, limit: 200 }), env));
  assert.equal(verdict?.permissionDecision, 'deny');
  assert.equal(decision(await runGuard([], readInput(file, { offset: 1, limit: 100 }, 'toolu_2'), env)), null);
});

test('readGuard false never refuses, and a missing or binary file passes', async () => {
  const off = await guardFixture({ readGuard: false });
  const offResult = await runGuard([], readInput(off.file), off.env);
  assert.equal(offResult.code, 0, offResult.stderr);
  assert.equal(decision(offResult), null);
  const on = await guardFixture({ ratios: { lines: 0.5 } });
  assert.equal(decision(await runGuard([], readInput(path.join(on.configDirectory, 'absent.ts')), on.env)), null);
  assert.equal(decision(await runGuard([], readInput(path.join(on.configDirectory, 'shot.png')), on.env)), null);
});

test('reset forgets the reads so the next identical read passes', async () => {
  const { env, configDirectory, file } = await guardFixture();
  const ranged = readInput(file, { offset: 1, limit: 20 });
  await runGuard(['book'], ranged, env);
  await runGuard(['reset'], { session_id: 's1', source: 'compact' }, env);
  assert.deepEqual((await record(configDirectory)).s1.reads, {});
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

test('a file of exactly 400 lines with a final newline passes an unbounded read', async () => {
  const { env, configDirectory } = await guardFixture();
  const file = path.join(configDirectory, 'four-hundred.ts');
  await fs.writeFile(file, Array.from({ length: 400 }, (_, index) => `line ${index + 1}\n`).join(''));
  assert.equal(decision(await runGuard([], readInput(file), env)), null);
});

test('EXO_SAVINGS=off never refuses and writes no record', async () => {
  const { env, configDirectory, file } = await guardFixture();
  const off = { ...env, EXO_SAVINGS: 'off' };
  assert.equal(decision(await runGuard([], readInput(file), off)), null);
  await runGuard(['book'], readInput(file, { offset: 1, limit: 20 }), off);
  assert.equal(await fs.access(path.join(configDirectory, 'exo', 'savings', 'sessions.json')).catch(() => 'absent'), 'absent');
});

test('the guard books no capped or duplicate counters beside its refusals', async () => {
  const { env, configDirectory, file } = await guardFixture();
  await runGuard([], readInput(file), env);
  const guard = (await record(configDirectory)).s1.guard;
  assert.deepEqual(Object.keys(guard).sort(), ['hookMs', 'refusals']);
});

test('readGuardLines in config.json moves the big-file limit, and a value that is not a whole number keeps 400', async () => {
  const raised = await guardFixture({ readGuardLines: 800 });
  assert.equal(decision(await runGuard([], readInput(raised.file), raised.env)), null);
  const lowered = await guardFixture({ readGuardLines: 100 });
  const loweredVerdict = decision(await runGuard([], readInput(lowered.file), lowered.env));
  assert.match(loweredVerdict.permissionDecisionReason, /has 600 lines and an unbounded read is capped at 100/);
  const broken = await guardFixture({ readGuardLines: 'lots' });
  const brokenVerdict = decision(await runGuard([], readInput(broken.file), broken.env));
  assert.match(brokenVerdict.permissionDecisionReason, /is capped at 400/);
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
