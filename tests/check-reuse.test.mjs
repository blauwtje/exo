import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { recordPass } from '#check-cache';

const source = path.resolve(import.meta.dirname, '..');

// A copy of the checkout whose origin/main is its first commit.
function copy(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-reuse-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
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
  // No detached `git maintenance run --auto` after the commit: it repacks .git while the
  // copied verifier runs and the cleanup removes the copy.
  git('config', 'maintenance.auto', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  return root;
}

const run = (root, ...flags) => spawnSync('node', [path.join(root, 'verify.mjs'), '--self-test', ...flags], { cwd: root, encoding: 'utf8', timeout: 300000 });

test('a changelog-only difference reuses the suite and self-test and still runs the static checks', (t) => {
  const root = copy(t);
  recordPass(root, 'npm run check', 1);
  const changelog = path.join(root, 'CHANGELOG.md');
  fs.writeFileSync(changelog, fs.readFileSync(changelog, 'utf8').replace(/^## Unreleased\n/m, '## Unreleased\n\n### Fixed\n\n- A reuse test line.\n'));
  const { stdout } = run(root);
  assert.match(stdout, /\[PASS\] skill script behavior:.*reused/);
  assert.match(stdout, /\[PASS\] verifier self-test:.*reused/);
  assert.match(stdout, /\[PASS\] plugin version:/);
  assert.match(stdout, /SUMMARY .*FAIL=0/);
});

test('plugin version runs strict on a reused pass: a changelog without the line fails', (t) => {
  const root = copy(t);
  const changelog = path.join(root, 'CHANGELOG.md');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  // origin/main carries an Unreleased line, so stripping it leaves CHANGELOG.md the only difference.
  fs.writeFileSync(changelog, fs.readFileSync(changelog, 'utf8').replace(/^## Unreleased\n/m, '## Unreleased\n\n### Fixed\n\n- A base line.\n'));
  git('commit', '-q', '-am', 'unreleased line');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  recordPass(root, 'npm run check', 1);
  fs.writeFileSync(changelog, fs.readFileSync(changelog, 'utf8').replace(/^## Unreleased\n[\s\S]*?(?=^## \d)/m, '## Unreleased\n\n'));
  const { stdout } = run(root);
  assert.match(stdout, /\[FAIL\] plugin version:/);
  assert.match(stdout, /\[PASS\] skill script behavior:.*reused/);
});
