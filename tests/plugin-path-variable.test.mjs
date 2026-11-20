import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const variable = /\$\{?(CLAUDE_PLUGIN_ROOT|CLAUDE_SKILL_DIR)\b/;

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith('.md') && entry.name !== 'SKILL.md' ? [path] : [];
  });
}

test('no markdown file read by path under skills holds a plugin path variable', () => {
  const hits = markdownFiles(join(root, 'skills')).flatMap((path) =>
    readFileSync(path, 'utf8')
      .split('\n')
      .flatMap((line, index) => (variable.test(line) ? [`${relative(root, path)}:${index + 1}`] : [])),
  );
  assert.deepEqual(hits, []);
});
