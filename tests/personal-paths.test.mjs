import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPersonalPaths } from '../verify/checks/personal-paths.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

const unixPath = (root, segment) => ['', root, segment, 'code'].join('/');
const windowsPath = (separator, segment) => ['C:', 'Users', segment].join(separator);

function run(files) {
  return checkOutcome(checkPersonalPaths, createRepository(tree(files)));
}

test('a file without a path passes', () => {
  const result = run({ 'a.md': 'plain text\n' });
  assert.equal(result.ok, true, result.detail);
});

test('a users path with a personal segment fails with its path and line', () => {
  const result = run({ 'docs/a.md': `one\nsee ${unixPath('Users', 'jane')}\n` });
  assert.match(result.detail, /docs\/a\.md:2 \/Users\/jane/);
});

test('a home path with a personal segment fails', () => {
  const result = run({ 'a.txt': unixPath('home', 'jane') });
  assert.match(result.detail, /a\.txt:1 \/home\/jane/);
});

test('a drive path fails with each separator form', () => {
  for (const separator of ['\\', '\\\\', '/']) {
    const result = run({ 'a.txt': windowsPath(separator, 'jane') });
    assert.match(result.detail, /a\.txt:1 C:.*jane/, separator);
  }
});

test('a segment inside a longer path passes', () => {
  const nested = (root) => ['src', root, 'index.md'].join('/');
  const result = run({ 'a.md': `${nested('home')} ${nested('Users')}` });
  assert.equal(result.ok, true, result.detail);
});

test('a lowercase drive path fails and a lowercase placeholder passes', () => {
  const lower = (segment) => ['c:', 'users', segment, 'code'].join('\\');
  assert.match(run({ 'a.txt': lower('jane') }).detail, /a\.txt:1/);
  const placeholder = run({ 'a.txt': lower('USER') });
  assert.equal(placeholder.ok, true, placeholder.detail);
});

test('the placeholder segment you passes', () => {
  const result = run({ 'a.md': unixPath('Users', 'you') });
  assert.equal(result.ok, true, result.detail);
});

test('an angle bracket form passes', () => {
  const result = run({ 'a.md': unixPath('Users', '<name>') });
  assert.equal(result.ok, true, result.detail);
});

test('a file with a NUL byte is skipped', () => {
  const result = run({ 'a.bin': `\0${unixPath('Users', 'jane')}` });
  assert.equal(result.ok, true, result.detail);
});

test('a file under a dotted folder is skipped', () => {
  const result = run({ '.github/a.md': unixPath('Users', 'jane') });
  assert.equal(result.ok, true, result.detail);
});

test('the shipped repository passes', () => {
  const result = checkOutcome(checkPersonalPaths, createRepository(new URL('..', import.meta.url).pathname));
  assert.equal(result.ok, true, result.detail);
});
