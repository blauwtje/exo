import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkPrinciples } from '../verify/checks/principles.mjs';
import { createRepository } from '../verify/repository.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const today = new Date().toISOString().slice(0, 10);

const page = (checked = today, extra = '') => `# Page

Checked: ${checked}

- **Rule.** Reason. [1] exo: skills/x.md
${extra}
## Sources

1. [Doc](https://example.com/doc), 2026-01-01
`;
const INDEX = '# Principles\n\n[a](./a.md)\n';

function run(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'principles-'));
  const directory = path.join(root, 'docs', 'principles');
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), text);
  const results = [];
  checkPrinciples({ result: (status, name, detail) => results.push(`${status} ${detail}`) }, createRepository(root));
  return results;
}

test('a dated, sourced, mapped page and a linking index pass', () => {
  assert.deepEqual(run({ 'README.md': INDEX, 'a.md': page() }).map((line) => line.slice(0, 4)), ['PASS']);
});

test('a missing Checked line fails', () => {
  assert.match(run({ 'README.md': INDEX, 'a.md': page().replace(/Checked: .*\n/, '') }).join('\n'), /FAIL a\.md: no valid/);
});

test('a malformed or future date fails', () => {
  assert.match(run({ 'README.md': INDEX, 'a.md': page('2026-13-45') }).join('\n'), /FAIL .*no valid/);
  assert.match(run({ 'README.md': INDEX, 'a.md': page('2999-01-01') }).join('\n'), /FAIL .*future/);
});

test('a page with no source URL fails', () => {
  assert.match(run({ 'README.md': INDEX, 'a.md': page().replace(/https:\/\/\S+?\)/, 'x)') }).join('\n'), /FAIL a\.md has no URL/);
});

test('a bullet without exo: fails', () => {
  assert.match(run({ 'README.md': INDEX, 'a.md': page(today, '- **Bare.** No mapping.\n') }).join('\n'), /FAIL a\.md has a bullet without exo:/);
});

test('an index missing a page link fails', () => {
  assert.match(run({ 'README.md': '# Principles\n', 'a.md': page() }).join('\n'), /FAIL README\.md has no link to a\.md/);
});

test('an oversized page and index fail', () => {
  const big = 'word '.repeat(1000);
  const lines = run({ 'README.md': INDEX + big, 'a.md': page(today, `- ${big} exo: gap\n`) }).join('\n');
  assert.match(lines, /FAIL a\.md is \d+ tokens, over 800/);
  assert.match(lines, /FAIL README\.md is \d+ tokens, over 300/);
});

test('a page older than the stale window warns, not fails', () => {
  const lines = run({ 'README.md': INDEX, 'a.md': page('2020-01-01') });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^WARN a\.md: Checked 2020-01-01 is older than 90 days/);
});

test('the repository pages pass', () => {
  const results = [];
  checkPrinciples({ result: (status, name, detail) => results.push(`${status} ${detail}`) }, createRepository(ROOT));
  assert.ok(results.every((line) => !line.startsWith('FAIL')), results.join('\n'));
});
