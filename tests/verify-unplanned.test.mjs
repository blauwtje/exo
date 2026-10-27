import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findUnplannedPaths } from '../skills/verify/scripts/verify.mjs';

const tasks = (...paths) => [{ files: paths.map((path) => ({ path })) }];

const CASES = [
  ['a listed file', ['src/Button.tsx'], 'src/Button.tsx', []],
  ['a file under a listed folder', ['src/'], 'src/deep/a.js', []],
  ['a same-stem companion of a listed file', ['src/Button.tsx'], 'src/Button.module.css', []],
  ['a same-stem test of a listed script', ['lib/run-plan.mjs'], 'lib/run-plan.test.mjs', []],
  ['a file with another stem', ['src/Button.tsx'], 'src/Buttons.tsx', ['src/Buttons.tsx']],
  ['a same-stem file in another folder', ['src/Button.tsx'], 'lib/Button.module.css', ['lib/Button.module.css']],
  ['a same-stem file in a subfolder', ['src/Button.tsx'], 'src/deep/Button.module.css', ['src/deep/Button.module.css']],
  ['a parent path escape', ['src/Button.tsx'], 'src/../Button.module.css', ['src/../Button.module.css']],
  ['a companion of a folder entry', ['src/'], 'other/a.js', ['other/a.js']],
  ['no listed files', [], 'src/Button.module.css', ['src/Button.module.css']],
];

for (const [name, listed, changed, expected] of CASES) {
  test(`findUnplannedPaths reads ${name}`, () => {
    assert.deepEqual(findUnplannedPaths(tasks(...listed), [changed]), expected);
  });
}
