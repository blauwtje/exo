import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const MEMORY = fileURLToPath(new URL('../skills/remember/scripts/memory.mjs', import.meta.url));
const HOOK = fileURLToPath(new URL('../hooks/session-start.mjs', import.meta.url));
const OFF_LINE = 'exo memory is off (memory=off); nothing written';
const MEMORY_TEXT = '# Project memory\n\nexo writes this file. Do not edit it by hand: run `/exo:remember` instead.\n';

async function repository(setting) {
  const directory = await fixture();
  execFileSync('git', ['init', '-q', directory]);
  fs.mkdirSync(path.join(directory, '.git', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(directory, '.git', 'exo', 'memory.md'), MEMORY_TEXT);
  fs.writeFileSync(path.join(directory, '.git', 'exo', 'memory.json'), JSON.stringify({ candidates: {}, lines: [], rejected: {} }));
  if (setting === undefined) return directory;
  fs.mkdirSync(path.join(directory, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(directory, '.claude', 'exo.json'), JSON.stringify({ memory: setting }));
  return directory;
}

function sessionStart(directory) {
  return run(HOOK, [], { input: JSON.stringify({ cwd: directory, source: 'startup' }), cwd: directory });
}

function stored(directory) {
  return fs.readFileSync(path.join(directory, '.git', 'exo', 'memory.json'), 'utf8');
}

test('the session hook points at the memory by default', async () => {
  const result = await sessionStart(await repository());
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /A project memory for this repository/);
});

test('the session hook points at no memory with memory=off and the file stays', async () => {
  const directory = await repository('off');
  const result = await sessionStart(directory);
  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /A project memory for this repository/);
  assert.equal(fs.readFileSync(path.join(directory, '.git', 'exo', 'memory.md'), 'utf8'), MEMORY_TEXT);
});

test('memory shows in the settings line only when not at default', async () => {
  const off = await sessionStart(await repository('off'));
  assert.match(off.stdout, /memory=off \(project\)/);
  const normal = await sessionStart(await repository());
  assert.doesNotMatch(normal.stdout, /memory=/);
});

test('a book with memory=off writes nothing and says so', async () => {
  const directory = await repository('off');
  const before = stored(directory);
  const result = await run(MEMORY, ['book', '--claim', 'A claim', '--quote', 'said so', '--session', 's1', '--cwd', directory]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), OFF_LINE);
  assert.equal(stored(directory), before);
  assert.equal(fs.readFileSync(path.join(directory, '.git', 'exo', 'memory.md'), 'utf8'), MEMORY_TEXT);
});

test('every write subcommand with memory=off prints the off line and changes nothing', async () => {
  const directory = await repository('off');
  const before = stored(directory);
  const commands = [
    ['write', '--claim', 'A claim', '--refs', 'tests/harness.mjs'],
    ['write', '--decision', '--claim', 'A decision', '--refs', 'tests/harness.mjs'],
    ['retire', '--claim', 'A claim'],
    ['reject', '--session', 's1', '--claim', 'A claim'],
    ['verify']
  ];
  for (const command of commands) {
    const result = await run(MEMORY, [...command, '--cwd', directory]);
    assert.equal(result.code, 0, `${command[0]}: ${result.stderr}`);
    assert.equal(result.stdout.trim(), OFF_LINE, command[0]);
  }
  assert.equal(stored(directory), before);
});

test('every read subcommand with memory=off prints nothing', async () => {
  const directory = await repository('off');
  for (const command of [['propose'], ['propose', '--count'], ['decisions'], ['render']]) {
    const result = await run(MEMORY, [...command, '--cwd', directory]);
    assert.equal(result.code, 0, `${command[0]}: ${result.stderr}`);
    assert.equal(result.stdout, '', command.join(' '));
  }
});

test('a book with the default setting still books', async () => {
  const directory = await repository();
  const result = await run(MEMORY, ['book', '--claim', 'A claim', '--quote', 'said so', '--session', 's1', '--cwd', directory]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /booked "A claim": 1 of 2 sessions/);
});
