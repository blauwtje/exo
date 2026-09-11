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
import { fixture } from './harness.mjs';

const GUARD = fileURLToPath(new URL('../skills/savings/scripts/read-guard.mjs', import.meta.url));

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

async function ledger(configDirectory) {
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
  const session = (await ledger(configDirectory)).s1;
  assert.equal(session.guard.capped, 1);
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
  assert.equal((await ledger(configDirectory)).s1.guard.refusals.toolu_1.bytesWithheld, wholeFile - rangeBytes);
  await runGuard(['book'], { ...ranged, agent_id: 'a1' }, env);
  assert.equal((await ledger(configDirectory)).s1.guard.refusals.toolu_1.bytesWithheld, wholeFile - rangeBytes);
  await runGuard(['reset'], { session_id: 's1', source: 'compact' }, env);
  await runGuard(['book'], readInput(file, { offset: 51, limit: 50 }, 'toolu_3'), env);
  const refusal = (await ledger(configDirectory)).s1.guard.refusals.toolu_1;
  assert.deepEqual([refusal.open, refusal.bytesWithheld], [false, wholeFile - rangeBytes]);
});

test('every run that reaches the ledger books its own time, an allowed read included', async () => {
  const { env, configDirectory, file } = await guardFixture();
  assert.equal(decision(await runGuard([], readInput(file, { offset: 1, limit: 20 }), env)), null);
  const afterPre = (await ledger(configDirectory)).s1.guard.hookMs;
  assert.ok(afterPre > 0, `hookMs ${afterPre}`);
  await runGuard(['book'], readInput(file, { offset: 1, limit: 20 }), env);
  assert.ok((await ledger(configDirectory)).s1.guard.hookMs > afterPre);
});

test('a booked ranged read is refused on an unchanged re-read with the earlier bytes, and a change lets it through', async () => {
  const { env, configDirectory, file } = await guardFixture();
  const ranged = readInput(file, { offset: 100, limit: 50 });
  assert.equal(decision(await runGuard([], ranged, env)), null);
  assert.equal((await runGuard(['book'], ranged, env)).stdout, '');
  const repeat = decision(await runGuard([], readInput(file, { offset: 100, limit: 50 }, 'toolu_9'), env));
  assert.equal(repeat.permissionDecision, 'deny');
  assert.match(repeat.permissionDecisionReason, /is unchanged since your read at/);
  let session = (await ledger(configDirectory)).s1;
  assert.equal(session.guard.duplicates, 1);
  assert.equal(session.guard.refusals.toolu_9.kind, 'duplicate');
  assert.equal(session.guard.refusals.toolu_9.bytesWithheld, session.reads[Object.keys(session.reads)[0]].bytes);

  await fs.appendFile(file, '\nline 601');
  assert.equal(decision(await runGuard([], ranged, env)), null);
  session = (await ledger(configDirectory)).s1;
  assert.equal(session.guard.duplicates, 1);
});

test('a read that never succeeded is not a duplicate', async () => {
  const { env, file } = await guardFixture();
  const ranged = readInput(file, { offset: 100, limit: 50 });
  assert.equal(decision(await runGuard([], ranged, env)), null);
  assert.equal(decision(await runGuard([], ranged, env)), null);
});

test('an explicit limit above the cap passes', async () => {
  const { env, file } = await guardFixture();
  assert.equal(decision(await runGuard([], readInput(file, { limit: 600 }), env)), null);
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
  assert.deepEqual((await ledger(configDirectory)).s1.reads, {});
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

test('EXO_SAVINGS=off never refuses and writes no ledger', async () => {
  const { env, configDirectory, file } = await guardFixture();
  const off = { ...env, EXO_SAVINGS: 'off' };
  assert.equal(decision(await runGuard([], readInput(file), off)), null);
  await runGuard(['book'], readInput(file, { offset: 1, limit: 20 }), off);
  assert.equal(await fs.access(path.join(configDirectory, 'exo', 'savings', 'sessions.json')).catch(() => 'absent'), 'absent');
});
