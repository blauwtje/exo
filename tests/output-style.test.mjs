// The harness reads an output style's frontmatter, so a missing key or a
// forced style fails silently in a real session. These checks hold the shipped
// style to the keys the harness reads and keep it opt-in.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const styleFile = path.join(fileURLToPath(new URL('../', import.meta.url)), 'output-styles', 'scannable.md');

function readFrontmatter(text) {
  const lines = text.split('\n');
  const closing = lines.indexOf('---', 1);
  assert.ok(lines[0] === '---' && closing > 0, 'scannable.md has no frontmatter block');
  const frontmatter = {};
  for (const line of lines.slice(1, closing)) {
    const separator = line.indexOf(': ');
    assert.ok(separator > 0, `unreadable frontmatter line: ${line}`);
    frontmatter[line.slice(0, separator)] = line.slice(separator + 2);
  }
  return { frontmatter, body: lines.slice(closing + 1).join('\n') };
}

test('the scannable style names itself and describes its shape', () => {
  const { frontmatter } = readFrontmatter(fs.readFileSync(styleFile, 'utf8'));
  assert.equal(frontmatter.name, 'scannable');
  assert.ok(frontmatter.description.length > 0, 'description is empty');
});

test('the scannable style keeps the coding instructions', () => {
  const { frontmatter } = readFrontmatter(fs.readFileSync(styleFile, 'utf8'));
  assert.equal(frontmatter['keep-coding-instructions'], 'true');
});

test('the scannable style is opt-in, never forced on the plugin', () => {
  const { frontmatter } = readFrontmatter(fs.readFileSync(styleFile, 'utf8'));
  assert.ok(!('force-for-plugin' in frontmatter), 'force-for-plugin must not be set');
});

test('the scannable style has a body with rules', () => {
  const { body } = readFrontmatter(fs.readFileSync(styleFile, 'utf8'));
  assert.match(body, /^## Shape$/m);
});
