import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { REPOSITORY_ROOT, run, tempDir } from './harness.mjs';

const SCRIPT = path.join(REPOSITORY_ROOT, 'skills/ideas/scripts/run-init.mjs');
const DATE = /^\d{4}-\d{2}-\d{2}-/;

async function init(home, question) {
  const result = await run(SCRIPT, ['--question', question, '--home', home]);
  const [, printed] = /^RUN=(.+)$/m.exec(result.stdout);
  return printed;
}

test('creates a dated folder with an ASCII lowercase slug of at most 40 characters', async () => {
  const home = tempDir();
  const folder = await init(home, 'Ideas for getting more people to read our newsletter, please!');
  assert.ok(path.isAbsolute(folder));
  assert.equal(path.dirname(folder), path.join(home, '.ideas'));
  const name = path.basename(folder);
  assert.match(name, DATE);
  assert.equal(name.slice(11), 'ideas-for-getting-more-people-to-read-ou');
  assert.ok(fs.statSync(folder).isDirectory());
});

test('strips accents and joins words with a single dash', async () => {
  const folder = await init(tempDir(), '  Café   crème -- ideas?  ');
  assert.equal(path.basename(folder).slice(11), 'cafe-creme-ideas');
});

test('adds -2 then -3 when the folder is taken', async () => {
  const home = tempDir();
  const first = await init(home, 'same question');
  const second = await init(home, 'same question');
  const third = await init(home, 'same question');
  assert.equal(second, `${first}-2`);
  assert.equal(third, `${first}-3`);
});
