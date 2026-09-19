// The project memory on disk: where the two files sit, what the rendered file
// says, and every rule the writer enforces before it changes them.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const MEMORY = fileURLToPath(new URL('../skills/memory/scripts/memory.mjs', import.meta.url));

// A real repository, so the store resolves to its git directory and no test ever
// writes beside the caller's own savings record. The path is resolved through
// realpath first: the temp directory is reached through a symlink on macOS, and
// git reports the resolved path, which no assertion built from mkdtemp matches.
async function repository() {
  const root = fs.realpathSync(await fixture());
  const init = spawnSync('git', ['-C', root, 'init', '-b', 'main'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  return root;
}

function memory(root, ...args) {
  return run(MEMORY, [...args, '--cwd', root], { cwd: root });
}

test('paths names both files inside the repository git directory', async () => {
  const root = await repository();
  const result = await memory(root, 'paths');
  assert.equal(result.code, 0, result.stderr);
  const printed = result.stdout.trim().split('\n');
  assert.deepEqual(printed, [
    path.join(root, '.git', 'exo', 'memory.json'),
    path.join(root, '.git', 'exo', 'memory.md')
  ]);
});

test('an empty memory renders both sections and writes no file', async () => {
  const root = await repository();
  const result = await memory(root, 'render');
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /## Current understanding\n\nNothing is attested twice yet\./);
  assert.match(result.stdout, /## Decisions\n\nNothing has been written yet\./);
  assert.equal(fs.existsSync(path.join(root, '.git', 'exo', 'memory.json')), false);
});

test('a claim booked in one session is not proposed', async () => {
  const root = await repository();
  const booked = await memory(root, 'book', '--claim', 'the suite runs under node --test', '--quote', 'no, it is node --test', '--session', 'one');
  assert.equal(booked.code, 0, booked.stderr);
  const proposed = await memory(root, 'propose');
  assert.equal(proposed.code, 0, proposed.stderr);
  assert.match(proposed.stdout, /no claim is attested twice yet/);
  assert.doesNotMatch(proposed.stdout, /the suite runs under node --test/);
});

test('a second booking from the same session does not make a second attestation', async () => {
  const root = await repository();
  await memory(root, 'book', '--claim', 'the suite runs under node --test', '--quote', 'no, it is node --test', '--session', 'one');
  await memory(root, 'book', '--claim', 'the suite runs under node --test', '--quote', 'again, node --test', '--session', 'one');
  const proposed = await memory(root, 'propose');
  assert.match(proposed.stdout, /no claim is attested twice yet/);
});

test('a claim booked in two sessions is proposed with both dated quotes', async () => {
  const root = await repository();
  await memory(root, 'book', '--claim', 'the suite runs under node --test', '--quote', 'no, it is node --test', '--session', 'one');
  await memory(root, 'book', '--claim', 'the suite runs under node --test', '--quote', 'I said node --test', '--session', 'two');
  const proposed = await memory(root, 'propose');
  assert.equal(proposed.code, 0, proposed.stderr);
  assert.match(proposed.stdout, /the suite runs under node --test/);
  assert.match(proposed.stdout, /no, it is node --test/);
  assert.match(proposed.stdout, /I said node --test/);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(proposed.stdout.split(today).length - 1, 2);
});

async function attested(root, claim) {
  await memory(root, 'book', '--claim', claim, '--quote', `first: ${claim}`, '--session', 'one');
  await memory(root, 'book', '--claim', claim, '--quote', `second: ${claim}`, '--session', 'two');
}

test('a claim attested once is refused', async () => {
  const root = await repository();
  await memory(root, 'book', '--claim', 'one writer only', '--quote', 'only one writer', '--session', 'one');
  const written = await memory(root, 'write', '--claim', 'one writer only', '--refs', '');
  assert.equal(written.code, 1);
  assert.match(written.stderr, /attested in 1 session/);
});

test('a ref outside the repository is refused and nothing is written', async () => {
  const root = await repository();
  await attested(root, 'the release workflow cuts the version');
  const escaping = await memory(root, 'write', '--claim', 'the release workflow cuts the version', '--refs', '../outside.txt');
  assert.equal(escaping.code, 1);
  assert.match(escaping.stderr, /not a path inside the repository/);
  const absolute = await memory(root, 'write', '--claim', 'the release workflow cuts the version', '--refs', path.join(root, 'inside.txt'));
  assert.equal(absolute.code, 1);
  assert.match(absolute.stderr, /not a path inside the repository/);
  // book writes both files on every attestation, so the refusal is proven by the
  // claim reaching neither, not by memory.md being absent.
  const rendered = fs.readFileSync(path.join(root, '.git', 'exo', 'memory.md'), 'utf8');
  assert.doesNotMatch(rendered, /the release workflow cuts the version/);
  const state = JSON.parse(fs.readFileSync(path.join(root, '.git', 'exo', 'memory.json'), 'utf8'));
  assert.deepEqual(state.lines, []);
});

test('an approved claim reaches both sections of the rendered file', async () => {
  const root = await repository();
  fs.writeFileSync(path.join(root, 'release.yml'), 'jobs:\n');
  await attested(root, 'the release workflow cuts the version');
  const written = await memory(root, 'write', '--claim', 'the release workflow cuts the version', '--refs', 'release.yml');
  assert.equal(written.code, 0, written.stderr);
  const rendered = fs.readFileSync(path.join(root, '.git', 'exo', 'memory.md'), 'utf8');
  assert.match(rendered, /- the release workflow cuts the version \(refs: release\.yml\)/);
  assert.match(rendered, new RegExp(`- ${new Date().toISOString().slice(0, 10)} the release workflow cuts the version`));
});

test('a replacing fact leaves exactly one live answer and marks the old one', async () => {
  const root = await repository();
  fs.writeFileSync(path.join(root, 'release.yml'), 'jobs:\n');
  await attested(root, 'the version is raised by hand');
  await memory(root, 'write', '--claim', 'the version is raised by hand', '--refs', 'release.yml');
  await attested(root, 'the release workflow cuts the version');
  const replaced = await memory(root, 'write', '--claim', 'the release workflow cuts the version', '--refs', 'release.yml', '--replaces', 'the version is raised by hand');
  assert.equal(replaced.code, 0, replaced.stderr);
  const rendered = fs.readFileSync(path.join(root, '.git', 'exo', 'memory.md'), 'utf8');
  const understanding = rendered.split('## Decisions')[0];
  assert.doesNotMatch(understanding, /raised by hand/);
  assert.match(rendered, /superseded by "the release workflow cuts the version": the version is raised by hand/);
});

test('a write past the budget is refused and names what to retire first', async () => {
  const root = await repository();
  fs.writeFileSync(path.join(root, 'release.yml'), 'jobs:\n');
  let refusal = null;
  for (let index = 0; index < 40 && refusal === null; index += 1) {
    const claim = `fact number ${index} about this repository and the way it is built and released`;
    await attested(root, claim);
    const written = await memory(root, 'write', '--claim', claim, '--refs', 'release.yml');
    if (written.code !== 0) refusal = written;
  }
  assert.notEqual(refusal, null, 'no write was ever refused');
  assert.match(refusal.stderr, /over the 2000 byte budget/);
  assert.match(refusal.stderr, /fact number 0 about this repository/);
});

test('verify keeps a line whose refs are intact and reports nothing dropped', async () => {
  const root = await repository();
  fs.writeFileSync(path.join(root, 'release.yml'), 'jobs:\n  cut:\n');
  await attested(root, 'the release workflow cuts the version');
  await memory(root, 'write', '--claim', 'the release workflow cuts the version', '--refs', 'release.yml#cut');
  const verified = await memory(root, 'verify');
  assert.equal(verified.code, 0, verified.stderr);
  assert.match(verified.stdout, /1 line verified, 0 dropped/);
  const rendered = fs.readFileSync(path.join(root, '.git', 'exo', 'memory.md'), 'utf8');
  assert.match(rendered, /- the release workflow cuts the version/);
});

test('verify drops a line whose file is gone and names it', async () => {
  const root = await repository();
  fs.writeFileSync(path.join(root, 'release.yml'), 'jobs:\n');
  await attested(root, 'the release workflow cuts the version');
  await memory(root, 'write', '--claim', 'the release workflow cuts the version', '--refs', 'release.yml');
  fs.rmSync(path.join(root, 'release.yml'));
  const verified = await memory(root, 'verify');
  assert.equal(verified.code, 0, verified.stderr);
  assert.match(verified.stdout, /dropped "the release workflow cuts the version": release\.yml/);
  assert.match(verified.stdout, /0 lines verified, 1 dropped/);
  const rendered = fs.readFileSync(path.join(root, '.git', 'exo', 'memory.md'), 'utf8');
  const [understanding, history] = rendered.split('## Decisions');
  assert.doesNotMatch(understanding, /the release workflow cuts the version/);
  assert.match(history, /dropped, release\.yml no longer exist: the release workflow cuts the version/);
});

test('a second verify does not re-report a line already dropped', async () => {
  const root = await repository();
  fs.writeFileSync(path.join(root, 'release.yml'), 'jobs:\n');
  await attested(root, 'the release workflow cuts the version');
  await memory(root, 'write', '--claim', 'the release workflow cuts the version', '--refs', 'release.yml');
  fs.rmSync(path.join(root, 'release.yml'));
  await memory(root, 'verify');
  const again = await memory(root, 'verify');
  assert.match(again.stdout, /0 lines verified, 0 dropped/);
  assert.doesNotMatch(again.stdout, /^dropped /m);
});

test('verify drops a line whose symbol is gone', async () => {
  const root = await repository();
  fs.writeFileSync(path.join(root, 'release.yml'), 'jobs:\n  cut:\n');
  await attested(root, 'the release workflow cuts the version');
  await memory(root, 'write', '--claim', 'the release workflow cuts the version', '--refs', 'release.yml#cut');
  fs.writeFileSync(path.join(root, 'release.yml'), 'jobs:\n  build:\n');
  const verified = await memory(root, 'verify');
  assert.match(verified.stdout, /dropped "the release workflow cuts the version": release\.yml#cut/);
});

test('a claim already live is refused rather than written a second time', async () => {
  const root = await repository();
  fs.writeFileSync(path.join(root, 'release.yml'), 'jobs:\n');
  await attested(root, 'the release workflow cuts the version');
  await memory(root, 'write', '--claim', 'the release workflow cuts the version', '--refs', 'release.yml');
  await attested(root, 'the release workflow cuts the version');
  const again = await memory(root, 'write', '--claim', 'the release workflow cuts the version', '--refs', 'release.yml');
  assert.equal(again.code, 1);
  assert.match(again.stderr, /is already live, written/);
  const rendered = fs.readFileSync(path.join(root, '.git', 'exo', 'memory.md'), 'utf8');
  const understanding = rendered.split('## Decisions')[0];
  assert.equal(understanding.split('the release workflow cuts the version').length - 1, 1);
});
