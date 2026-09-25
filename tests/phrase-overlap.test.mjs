// phrase-overlap.mjs reports every run of eight prose words an exo instruction
// file shares with a source directory, and never a run made of code, commands
// or file names. The exo side is the repository the script sits in, so each
// test copies the script into a fixture repository of its own.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../verify/phrase-overlap.mjs', import.meta.url));
const SHARED = 'the reviewer reads every changed line before the merge';

async function writeFile(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
}

// One exo skill file and one source file, then the script's plain output.
async function overlap(exoText, sourceText) {
  const root = await fixture();
  const script = path.join(root, 'verify', 'phrase-overlap.mjs');
  await writeFile(script, await fs.readFile(SCRIPT, 'utf8'));
  await writeFile(path.join(root, 'skills', 'alpha', 'SKILL.md'), exoText);
  const source = path.join(root, 'external');
  await writeFile(path.join(source, 'guide', 'notes.md'), sourceText);
  return run(script, [source], { cwd: root });
}

test('a shared eight-word sentence is reported with both lines', async () => {
  const result = await overlap(
    ['---', 'name: alpha', '---', '', 'Opening words.', '', `${SHARED}.`, ''].join('\n'),
    ['# Notes', '', `Then ${SHARED}, always.`, ''].join('\n')
  );
  assert.equal(result.code, 1);
  assert.deepEqual(result.stdout.trim().split('\n'), [
    `skills/alpha/SKILL.md:7  external/guide/notes.md:3  "${SHARED}"`,
    'TOTAL 1'
  ]);
});

test('a shared run of seven words is not reported', async () => {
  const seven = 'the reviewer reads every changed line before';
  const result = await overlap(`${seven} lunch.\n`, `${seven} dinner.\n`);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), 'TOTAL 0');
});

test('the same words inside a code fence or an inline code span are not reported', async () => {
  const exoText = ['```text', SHARED, '```', '', `Run \`${SHARED}\` now.`, ''].join('\n');
  const result = await overlap(exoText, `${SHARED}\n`);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), 'TOTAL 0');
});

test('a shared run broken by a path token is not reported', async () => {
  const text = 'the reviewer reads every docs/changed.md line before the merge\n';
  const result = await overlap(text, text);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), 'TOTAL 0');
});

test('a shared run that wraps across a line break is found', async () => {
  const result = await overlap(
    ['Intro line.', 'the reviewer reads every', 'changed line before the merge', ''].join('\n'),
    `${SHARED}\n`
  );
  assert.equal(result.code, 1);
  assert.deepEqual(result.stdout.trim().split('\n'), [
    `skills/alpha/SKILL.md:2  external/guide/notes.md:1  "${SHARED}"`,
    'TOTAL 1'
  ]);
});
