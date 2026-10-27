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

function run(files, extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'principles-'));
  const directory = path.join(root, 'docs', 'principles');
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), text);
  for (const [name, text] of Object.entries(extra)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
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

test('a cite to a missing file fails', () => {
  const bullet = '- **Rule.** Reason. [1] exo: `skills/gone.md`\n';
  assert.match(run({ 'README.md': INDEX, 'a.md': page(today, bullet) }, { 'skills/x.md': '' }).join('\n'), /FAIL a\.md cites `skills\/gone\.md`, the span is not an existing path/);
});

test('a span whose leading run is not a root entry is prose', () => {
  const bullet = '- **Rule.** Reason. [1] exo: `state.json`, `nowhere/gone.md`, `stop_hook_active`, `--runs`\n';
  assert.deepEqual(run({ 'README.md': INDEX, 'a.md': page(today, bullet) }, { 'skills/x.md': '' }).map((line) => line.slice(0, 4)), ['PASS']);
});

test('an anchor span after a file cite must occur in the file', () => {
  const extra = { 'x/code.mjs': 'function planRoute() {}\n', 'x/doc.md': '# Doc\nsome literal text\n' };
  const files = { 'README.md': INDEX, 'a.md': page(today, '- **R.** [1] exo: `x/code.mjs` `planRoute` routes, `x/doc.md` `literal text`\n') };
  assert.deepEqual(run(files, extra).map((line) => line.slice(0, 4)), ['PASS']);
  files['a.md'] = page(today, '- **R.** [1] exo: `x/code.mjs` `nopeGone`, `x/doc.md` `missing text`\n');
  const lines = run(files, extra).filter((line) => line.startsWith('FAIL'));
  assert.equal(lines.length, 2);
  assert.match(lines[0], /x\/code\.mjs but anchor nopeGone is gone/);
  assert.match(lines[1], /x\/doc\.md but anchor missing text is gone/);
});

test('a one-character anchor fails', () => {
  const files = { 'README.md': INDEX, 'a.md': page(today, '- **R.** [1] exo: `x/code.mjs` `a`\n') };
  assert.match(run(files, { 'x/code.mjs': 'a\n' }).join('\n'), /FAIL a\.md .*anchor a .*2 identifier characters/);
});

test('a path cite must name an existing file or folder exactly', () => {
  const message = /the span is not an existing path; cite the file alone and put the anchor in its own backticked span/;
  const cites = ['`x/gone.mjs#planRoute`', '`x/code.mjs#L12`', '`x/code.mjs:12`', '`x/code.mjs:8, 11`', '`x/code.mjs:8,11`', '`x/code.mjs:5-10`', '`x/code.mjs:planRoute`', '`x/gone.mjs:planRoute`'];
  for (const cite of cites) {
    const files = { 'README.md': INDEX, 'a.md': page(today, `- **R.** [1] exo: ${cite}\n`) };
    const lines = run(files, { 'x/code.mjs': 'function planRoute() {}\n' });
    assert.deepEqual(lines.map((line) => line.slice(0, 4)), ['FAIL'], cite);
    assert.match(lines[0], message, cite);
  }
});

test('a path cite matches each segment exactly: case, empty, . and .. fail', () => {
  const extra = { 'x/code.mjs': 'a\n', 'lib/f.txt': 'a\n' };
  for (const cite of ['x/CODE.mjs', 'lib/../lib', 'lib//', 'lib/./f.txt']) {
    const files = { 'README.md': INDEX, 'a.md': page(today, `- **R.** [1] exo: \`${cite}\`\n`) };
    const lines = run(files, extra).filter((line) => line.startsWith('FAIL') && line.includes(`\`${cite}\``));
    assert.equal(lines.length, 1, cite);
  }
});

test('a folder cite must exist and takes no anchor', () => {
  const extra = { 'x/dir/f.txt': 'a\n' };
  const files = { 'README.md': INDEX, 'a.md': page(today, '- **R.** [1] exo: `x/dir/` `whatever`\n') };
  assert.deepEqual(run(files, extra).map((line) => line.slice(0, 4)), ['PASS']);
  files['a.md'] = page(today, '- **R.** [1] exo: `x/gone/`, a missing script `x/run.sh`\n');
  const lines = run(files, extra).filter((line) => line.startsWith('FAIL'));
  assert.equal(lines.length, 2);
  assert.match(lines[0], /cites `x\/gone\/`, the span is not an existing path/);
  assert.match(lines[1], /cites `x\/run\.sh`, the span is not an existing path/);
});

test('a folder cite without a trailing slash and an anchor fails instead of throwing', () => {
  const extra = { 'x/dir/f.txt': 'a\n' };
  const files = { 'README.md': INDEX, 'a.md': page(today, '- **R.** [1] exo: `x/dir` `whatever`\n') };
  const lines = run(files, extra).filter((line) => line.startsWith('FAIL'));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /cites x\/dir with anchor whatever but it is a folder/);
  files['a.md'] = page(today, '- **R.** [1] exo: `x/dir`\n');
  assert.deepEqual(run(files, extra).map((line) => line.slice(0, 4)), ['PASS']);
});

test('CONTRIBUTING documents exact path cites, the : and # tail FAIL and folder cites', () => {
  const text = fs.readFileSync(path.join(ROOT, 'CONTRIBUTING.md'), 'utf8').split('\n').find((line) => line.startsWith('`docs/principles/README.md`'));
  assert.doesNotMatch(text, /#anchor/);
  assert.match(text, /exactly/);
  assert.match(text, /`:` or `#` tail/);
  assert.match(text, /folder/);
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

test('the principles index states the value rule and CONTRIBUTING names it', () => {
  const index = fs.readFileSync(path.join(ROOT, 'docs', 'principles', 'README.md'), 'utf8');
  assert.match(index, /only if its value is at least its cost in tokens, time and false blocks/);
  assert.match(index, /unsure → speed-ledger line/);
  assert.match(fs.readFileSync(path.join(ROOT, 'CONTRIBUTING.md'), 'utf8'), /value rule/);
});
