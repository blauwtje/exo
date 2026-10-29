import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CAP, renderMap } from '../skills/spec/scripts/map-render.mjs';

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
