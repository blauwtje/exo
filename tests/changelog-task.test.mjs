import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { changelogLine, landChangelogTask } from '../skills/build/scripts/changelog-task.mjs';

const CHANGELOG = [
  '# Changelog', '', '## Unreleased', '', '### Added', '- first', '', '### Changed', '- old', '', '## 1.0.0', '', '### Added', '- shipped', ''
].join('\n');

const task = (overrides = {}) => ({
  number: 3,
  files: [{ path: 'CHANGELOG.md' }],
  data: 'one line under `### Changed` in `## Unreleased` holding the Proof\'s text',
  proof: "grep -qF 'A run lands it.' CHANGELOG.md",
  ...overrides
});

function checkout(text = CHANGELOG) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-task-'));
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), text);
  return root;
}

test('the line is the Proof text when Data names no literal that holds it', () => {
  assert.deepEqual(changelogLine(task(), CHANGELOG), { heading: '### Changed', line: 'A run lands it.' });
});

test('the line is the longest Data literal that extends the Proof text', () => {
  const data = 'the `### Added` line `A run lands it.` and `A run lands it. More words.`';
  assert.deepEqual(changelogLine(task({ data }), CHANGELOG), { heading: '### Added', line: 'A run lands it. More words.' });
});

test('a Proof wrapped in backticks parses', () => {
  const proof = "`grep -qF 'A run lands it.' CHANGELOG.md`";
  assert.equal(changelogLine(task({ proof }), CHANGELOG).line, 'A run lands it.');
});

test('another file, a compound Proof, a missing subheading or present text give null', () => {
  assert.equal(changelogLine(task({ files: [{ path: 'README.md' }] }), CHANGELOG), null);
  assert.equal(changelogLine(task({ files: [{ path: 'CHANGELOG.md' }, { path: 'a.md' }] }), CHANGELOG), null);
  assert.equal(changelogLine(task({ proof: "grep -qF 'A run lands it.' CHANGELOG.md && true" }), CHANGELOG), null);
  assert.equal(changelogLine(task({ data: 'a line under `### Fixed`' }), CHANGELOG), null);
  assert.equal(changelogLine(task({ data: 'a line under `### Added` or `### Changed`' }), CHANGELOG), null);
  assert.equal(changelogLine(task(), `${CHANGELOG}\nA run lands it.\n`), null);
});

test('the line lands as the last bullet of its subheading and the report holds the pass line', () => {
  const root = checkout();
  let seen = null;
  const landed = landChangelogTask({ root, task: task(), land: () => {
    seen = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    return true;
  } });
  assert.equal(landed, true);
  assert.match(seen, /### Changed\n- old\n- A run lands it\.\n\n## 1\.0\.0/);
  assert.match(fs.readFileSync(path.join(root, '.exo/implementer-3.md'), 'utf8'), /^- `grep -qF 'A run lands it\.' CHANGELOG\.md`: pass$/m);
});

test('a failed land restores the file and removes the report', () => {
  for (const land of [() => false, () => { throw new Error('boom'); }]) {
    const root = checkout();
    assert.equal(landChangelogTask({ root, task: task(), land }), false);
    assert.equal(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), CHANGELOG);
    assert.equal(fs.existsSync(path.join(root, '.exo/implementer-3.md')), false);
  }
});

test('a thrown land leaves its message on stderr', () => {
  const root = checkout();
  const written = [];
  const original = process.stderr.write;
  process.stderr.write = (chunk) => { written.push(String(chunk)); return true; };
  try {
    landChangelogTask({ root, task: task(), land: () => { throw new Error('boom'); } });
  } finally {
    process.stderr.write = original;
  }
  assert.match(written.join(''), /boom/);
});
