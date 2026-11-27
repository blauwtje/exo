import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const skills = fs.readdirSync(path.join(root, 'skills')).map((name) => path.join('skills', name, 'SKILL.md'));

test('no file names the scratch path without the TMPDIR fallback', () => {
  for (const file of ['BASE.md', ...skills]) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(text, /\$TMPDIR\/exo\//, file);
  }
});
