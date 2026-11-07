import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localGitDefinitions } from '../verify/checks/git-helper.mjs';

const file = (relativePath, text) => ({ relativePath, text });

test('a local function git definition fails', () => {
  assert.deepEqual(localGitDefinitions([file('skills/x/scripts/a.mjs', 'function git(root, args) {}\n')]), ['skills/x/scripts/a.mjs']);
});

test('a const git arrow fails', () => {
  assert.deepEqual(localGitDefinitions([file('verify/checks/a.mjs', 'export const git = (root) => root;\n')]), ['verify/checks/a.mjs']);
});

test('lib/git.mjs and imports pass', () => {
  const files = [file('lib/git.mjs', 'export function git() {}\n'), file('lib/a.mjs', "import { git } from './git.mjs';\ngit(1, []);\n")];
  assert.deepEqual(localGitDefinitions(files), []);
});

test('a differently named adapter passes', () => {
  assert.deepEqual(localGitDefinitions([file('lib/a.mjs', 'function gitStrict() {}\n')]), []);
});

test('the allowed exceptions pass', () => {
  assert.deepEqual(localGitDefinitions([file('skills/build/scripts/land-run.mjs', 'const git = () => 1;\n')]), []);
});
