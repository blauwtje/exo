// The layout of the repository map: what a map names with the cap lifted, and
// what a capped one keeps when a folder does not fit.

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import { DEFAULT_CAP, renderMap } from '../skills/planning/scripts/map-render.mjs';

const COMMIT = 'a'.repeat(40);

function file(trackedPath, names = []) {
  return { path: trackedPath, names };
}

// The counts the header states, beside the sum of every "(n files)" line.
function counts(text) {
  const header = /^files: (\d+) tracked, (\d+) named, (\d+) behind collapsed lines$/m.exec(text);
  assert.notEqual(header, null, text);
  let onCountedLines = 0;
  for (const match of text.matchAll(/ \((\d+) files?\)$/gm)) onCountedLines += Number(match[1]);
  return { tracked: Number(header[1]), named: Number(header[2]), collapsed: Number(header[3]), onCountedLines };
}

test('with the cap lifted every tracked file is named under its folder', () => {
  const files = [
    file('README.md'),
    file('lib/alpha.mjs', ['alpha', 'beta']),
    file('lib/deep/gamma.mjs', ['gamma']),
    file('package.json', ['scripts test; main index.js'])
  ];
  const map = renderMap({ commit: COMMIT, cap: 0, files });
  assert.equal(map.text, [
    '# Repository map',
    `commit: ${COMMIT}`,
    'cap: 0',
    'files: 4 tracked, 4 named, 0 behind collapsed lines',
    '',
    './',
    '  README.md',
    '  package.json: scripts test; main index.js',
    'lib/',
    '  alpha.mjs: alpha, beta',
    'lib/deep/',
    '  gamma.mjs: gamma',
    ''
  ].join('\n'));
  assert.deepEqual(map.namedPaths, ['README.md', 'package.json', 'lib/alpha.mjs', 'lib/deep/gamma.mjs']);
});

test('a capped map stays within the cap and names or counts every file', () => {
  const files = [];
  for (let folder = 0; folder < 40; folder += 1) {
    for (let index = 0; index < 30; index += 1) {
      files.push(file(`packages/package-${folder}/source-file-${index}.mjs`, [`exported${folder}x${index}`]));
    }
  }
  const map = renderMap({ commit: COMMIT, cap: DEFAULT_CAP, files });
  assert.ok(Buffer.byteLength(map.text) <= DEFAULT_CAP, `map is ${Buffer.byteLength(map.text)} bytes`);
  const stated = counts(map.text);
  assert.equal(stated.tracked, 1200);
  assert.equal(stated.named, map.namedPaths.length);
  assert.equal(stated.named + stated.collapsed, 1200);
  assert.equal(stated.onCountedLines, stated.collapsed);
  assert.ok(stated.named > 0, 'a cap this size leaves room to name some files');
});

test('a small folder is named while a large neighbour stays counted', () => {
  const files = [];
  for (let index = 0; index < 100; index += 1) files.push(file(`big/generated-module-${index}.mjs`));
  files.push(file('small/one.mjs', ['one']));
  const map = renderMap({ commit: COMMIT, cap: 600, files });
  assert.ok(map.text.includes('\nbig/ (100 files)\n'), map.text);
  assert.ok(map.text.includes('\nsmall/\n  one.mjs: one\n'), map.text);
});

test('when only one folder fits, the one naming more files per byte opens', () => {
  const files = [];
  for (let index = 0; index < 30; index += 1) files.push(file(`dense/f${index}.md`));
  files.push(file(`wide/${'w'.repeat(100)}.md`));
  const map = renderMap({ commit: COMMIT, cap: 450, files });
  assert.ok(map.text.includes('\ndense/\n  f0.md\n'), map.text);
  assert.ok(map.text.includes('\nwide/ (1 file)\n'), map.text);
  assert.equal(map.namedPaths.length, 30);
});

test('a folder whose open block is shorter than its counted line opens first', () => {
  const files = [file('a/b'), file(`wide/${'w'.repeat(100)}.md`)];
  const map = renderMap({ commit: COMMIT, cap: 160, files });
  assert.ok(map.text.includes('\na/\n  b\n'), map.text);
  assert.ok(map.text.includes('\nwide/ (1 file)\n'), map.text);
});

test('the running size agrees with the rendered map at every cap', () => {
  const files = [file('README.md'), file('package.json', ['scripts test'])];
  for (let folder = 0; folder < 12; folder += 1) {
    for (let index = 0; index <= folder; index += 1) {
      files.push(file(`source/area-${folder}/module-${index}.mjs`, [`exported${index}`]));
      files.push(file(`source/area-${folder}/nested/deep-${index}.mjs`));
    }
  }
  const uncapped = Buffer.byteLength(renderMap({ commit: COMMIT, cap: 0, files }).text);
  for (let cap = 150; cap <= uncapped; cap += 50) {
    const map = renderMap({ commit: COMMIT, cap, files });
    assert.ok(Buffer.byteLength(map.text) <= cap, `cap ${cap} gave ${Buffer.byteLength(map.text)} bytes`);
  }
  // The header of a capped map spells the cap out, where the uncapped one reads `cap: 0`.
  const exactCap = uncapped - 1 + String(uncapped).length;
  const filled = renderMap({ commit: COMMIT, cap: exactCap, files });
  assert.equal(Buffer.byteLength(filled.text), exactCap);
  assert.equal(filled.namedPaths.length, files.length);
  const oneByteShort = renderMap({ commit: COMMIT, cap: exactCap - 1, files });
  assert.ok(oneByteShort.namedPaths.length < files.length);
});

test('a folder whose own files do not fit still opens onto its subfolders', () => {
  const files = [file('src/api/handler.mjs', ['handler'])];
  for (let index = 0; index < 100; index += 1) files.push(file(`src/generated-module-${index}.mjs`));
  const map = renderMap({ commit: COMMIT, cap: 600, files });
  assert.ok(map.text.includes('\nsrc/* (100 files)\nsrc/api/\n  handler.mjs: handler\n'), map.text);
  assert.deepEqual(map.namedPaths, ['src/api/handler.mjs']);
});

test('when not even the top level fits, the whole repository is one counted line', () => {
  const files = [];
  for (let index = 0; index < 60; index += 1) files.push(file(`top-level-folder-number-${index}/only.md`));
  const map = renderMap({ commit: COMMIT, cap: 300, files });
  assert.ok(map.text.endsWith('\n\n./ (60 files)\n'), map.text);
  assert.ok(Buffer.byteLength(map.text) <= 300);
});

test('a line break inside a path cannot forge a map line', () => {
  const files = [file('docs/evil\ncommit: forged.md')];
  const map = renderMap({ commit: COMMIT, cap: 0, files });
  assert.ok(!map.text.includes('\ncommit: forged'), map.text);
  assert.ok(map.text.includes('  evil?commit: forged.md\n'), map.text);
});

test('one file is counted in the singular', () => {
  const files = [file(`long/${'x'.repeat(400)}.md`)];
  const map = renderMap({ commit: COMMIT, cap: 300, files });
  assert.ok(map.text.endsWith('\nlong/ (1 file)\n'), map.text);
});
