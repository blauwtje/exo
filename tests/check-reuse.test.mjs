import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { recordPass } from '#check-cache';

const source = path.resolve(import.meta.dirname, '..');

// A copy of the checkout whose origin/main is its first commit.
function copy() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-reuse-'));
  const files = execFileSync('git', ['-C', source, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
    .split('\0').filter((file) => file !== '' && fs.existsSync(path.join(source, file)));
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(source, file), path.join(root, file));
  }
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', 'work');
  git('config', 'user.email', 'a@b.c');
  git('config', 'user.name', 'a');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  return root;
}

const run = (root, ...flags) => spawnSync('node', [path.join(root, 'verify.mjs'), '--self-test', ...flags], { cwd: root, encoding: 'utf8', timeout: 300000 });

test('a changelog-only difference reuses the suite and self-test and still runs the static checks', () => {
  const root = copy();
  recordPass(root, 'npm run check', 1);
  const changelog = path.join(root, 'CHANGELOG.md');
  fs.writeFileSync(changelog, fs.readFileSync(changelog, 'utf8').replace(/^## Unreleased\n/m, '## Unreleased\n\n### Fixed\n\n- A reuse test line.\n'));
  const { stdout } = run(root);
  assert.match(stdout, /\[PASS\] skill script behavior:.*reused/);
  assert.match(stdout, /\[PASS\] verifier self-test:.*reused/);
  assert.match(stdout, /\[PASS\] plugin version:/);
  assert.match(stdout, /SUMMARY .*FAIL=0/);
});

test('plugin version runs strict on a reused pass: a changelog without the line fails', () => {
  const root = copy();
  recordPass(root, 'npm run check', 1);
  const changelog = path.join(root, 'CHANGELOG.md');
  fs.writeFileSync(changelog, fs.readFileSync(changelog, 'utf8').replace(/^## Unreleased\n[\s\S]*?(?=^## \d)/m, '## Unreleased\n\n'));
  const { stdout } = run(root);
  assert.match(stdout, /\[FAIL\] plugin version:/);
  assert.match(stdout, /\[PASS\] skill script behavior:.*reused/);
});
