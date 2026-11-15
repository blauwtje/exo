import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DEFAULT_CAP, renderMap } from '../skills/spec/scripts/repo-map.mjs';

const commit = 'abc1234';

function manyFiles() {
  const files = [];
  for (let folder = 0; folder < 40; folder += 1) {
    for (let index = 0; index < 20; index += 1) {
      files.push({ path: `area${folder}/deep/file-with-a-long-name-${index}.md`, names: [] });
    }
  }
  files.push({ path: 'top.mjs', names: ['alpha', 'beta'] });
  return files;
}

test('the default map names every tracked file', () => {
  const files = manyFiles();
  const map = renderMap({ commit, cap: DEFAULT_CAP, files });
  assert.match(map.text, /^files: 801 tracked, 801 named, 0 behind collapsed lines$/m);
  assert.match(map.text, /^ {2}file-with-a-long-name-19\.md$/m);
  assert.match(map.text, /^ {2}top\.mjs: alpha, beta$/m);
  assert.equal(map.namedPaths.length, files.length);
});

test('an explicit cap still bounds the map and collapses folders', () => {
  const map = renderMap({ commit, cap: 12000, files: manyFiles() });
  assert.ok(Buffer.byteLength(map.text) <= 12000);
  assert.match(map.text, /behind collapsed lines$/m);
  assert.doesNotMatch(map.text, / 0 behind collapsed lines/);
});

test('the script lists manifest fields, skips an unparsable manifest and names exports', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-map-'));
  const run = (command, args) => execFileSync(command, args, { cwd: repo, encoding: 'utf8' });
  fs.mkdirSync(path.join(repo, 'broken'));
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ scripts: { build: 'x', test: 'y' }, main: 'index.mjs' }));
  fs.writeFileSync(path.join(repo, 'broken', 'package.json'), '{not json');
  fs.writeFileSync(path.join(repo, 'tool.mjs'), 'export const alpha = 1;\nexport function beta() {}\n');
  run('git', ['init', '-q']);
  run('git', ['add', '.']);
  run('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'init']);
  const script = path.join(import.meta.dirname, '..', 'skills', 'spec', 'scripts', 'repo-map.mjs');
  const [mapFile] = run('node', [script]).split('\n');
  const text = fs.readFileSync(mapFile, 'utf8');
  assert.match(text, /package\.json: scripts build test; main index\.mjs$/m);
  assert.match(text, /^ {2}package\.json$/m);
  assert.match(text, /tool\.mjs: alpha, beta$/m);
  fs.rmSync(repo, { recursive: true, force: true });
});
