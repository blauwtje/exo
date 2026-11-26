import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { run, tempDir } from './harness.mjs';

const AUTHOR_CHECK = new URL('../skills/author/scripts/author-check.mjs', import.meta.url).pathname;

async function check(text) {
  const directory = tempDir();
  const target = path.join(directory, 'SKILL.md');
  fs.writeFileSync(target, text);
  return run(AUTHOR_CHECK, ['--target', target]);
}

test('prints the line count, em dashes, CAPS words outside code and the frontmatter keys', async () => {
  const text = '---\nname: x\ndescription: "d"\nmodel: opus\n---\n\nYou MUST not — ever. Use `NEVER` and OK.\n\n```\nSTOP\n```\n';
  const result = await check(text);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(
    result.stdout,
    'Lines: 11\nEm dashes: 1\nCAPS words: 2\nFrontmatter keys: name, description, model\n',
  );
});

test('a missing target is a usage error', async () => {
  const result = await run(AUTHOR_CHECK, []);
  assert.equal(result.code, 2);
});
