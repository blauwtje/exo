import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const REPO = path.resolve(import.meta.dirname, '..');

function copy(root, file, text) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}

function checkout(lockVersion) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bump-'));
  for (const file of ['bump.mjs', 'verify/changelog.mjs']) {
    copy(root, file, fs.readFileSync(path.join(REPO, file), 'utf8'));
  }
  const json = (version) => `{\n  "name": "exo",\n  "version": "${version}"\n}\n`;
  copy(root, 'package.json', json('1.2.3'));
  copy(root, '.claude-plugin/plugin.json', json('1.2.3'));
  copy(root, '.claude-plugin/marketplace.json', json('1.2.3'));
  copy(root, 'package-lock.json', [
    '{', '  "name": "exo",', `  "version": "${lockVersion}",`, '  "lockfileVersion": 3,', '  "packages": {',
    '    "": {', '      "name": "exo",', `      "version": "${lockVersion}",`, '      "engines": { "node": ">=22" }', '    },',
    '    "node_modules/dep": {', '      "version": "1.2.3"', '    }', '  }', '}', ''
  ].join('\n'));
  copy(root, 'CHANGELOG.md', '# Changelog\n\n## Unreleased\n\n### Fixed\n- a fix\n\n## 1.2.3 - 2026-01-01\n\n### Added\n- shipped\n');
  return root;
}

test('bump sets both lockfile versions, even when the lockfile lags', () => {
  const root = checkout('0.22.2');
  const run = spawnSync(process.execPath, [path.join(root, 'bump.mjs'), 'patch'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(lock.version, '1.2.4');
  assert.equal(lock.packages[''].version, '1.2.4');
  assert.equal(lock.packages['node_modules/dep'].version, '1.2.3');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, '1.2.4');
  assert.match(run.stdout, /package-lock\.json/);
});

test('bump fails and writes nothing when the lockfile has no version fields', () => {
  const root = checkout('1.2.3');
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');
  const run = spawnSync(process.execPath, [path.join(root, 'bump.mjs'), 'patch'], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, '1.2.3');
});
