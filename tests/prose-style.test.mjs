import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { hashedWholeFiles } from '../benchmarks/routing.mjs';
import { proseStyleRow, proseStyleRows, violates } from '../verify/prose-style.mjs';
import { tempDir } from './harness.mjs';

const GOOD = '---\nname: x\n---\n# Title\n\nDo the thing well.\n\n- one\n- two\n';

test('a plain skill passes', () => {
  const row = proseStyleRow('skills/x/SKILL.md', GOOD);
  assert.equal(violates(row), false);
  assert.equal(row.goalLine, true);
});

test('arrow bullets over the ratio fail', () => {
  const row = proseStyleRow('a.md', '- a → b\n- c → d\n- e\n');
  assert.ok(row.arrowRatio > 0.3);
  assert.equal(violates(row), true);
});

test('arrows in tables and fences are not counted', () => {
  const row = proseStyleRow('a.md', '| a → b |\n\n```\n- x → y\n```\n- plain\n');
  assert.equal(row.arrowRatio, 0);
});

test('a bullet with two semicolons fails', () => {
  const row = proseStyleRow('a.md', '- a; b; c\n- d; e\n');
  assert.equal(row.chainedBullets, 1);
  assert.equal(violates(row), true);
});

test('a skill opening on a bullet lacks a goal line', () => {
  const row = proseStyleRow('skills/x/SKILL.md', '# Title\n\n- first\n');
  assert.equal(row.goalLine, false);
  assert.equal(violates(row), true);
});

test('an agent opening on a table lacks a goal line, other files need none', () => {
  assert.equal(proseStyleRow('agents/x.md', '# T\n| a |\n').goalLine, false);
  assert.equal(proseStyleRow('docs/x.md', '# T\n- a\n').goalLine, true);
});

test('never over twice fails', () => {
  const row = proseStyleRow('a.md', 'Never a. Never b. Never c.\n');
  assert.equal(row.nevers, 3);
  assert.equal(violates(row), true);
  assert.equal(violates(proseStyleRow('a.md', 'Never a. Never b.\n')), false);
});

test('the check reports a failing instruction file and passes the clean tree', async () => {
  const { checkProseStyle } = await import('../verify/checks/prose-style.mjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = tempDir('prose-');
  fs.mkdirSync(path.join(root, 'skills', 'x'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'x', 'SKILL.md'), '# T\n\n- a\n');
  const calls = [];
  const report = { assert: (...args) => calls.push({ ok: args[0], fail: args[3] }) };
  checkProseStyle(report, { root });
  assert.equal(calls[0].ok, false);
  assert.match(calls[0].fail, /skills\/x\/SKILL\.md \(no goal line\)/);
  fs.writeFileSync(path.join(root, 'skills', 'x', 'SKILL.md'), '# T\n\nDo it.\n');
  checkProseStyle(report, { root });
  assert.equal(calls[1].ok, true);
});

test('code spans and quotes do not count', () => {
  const row = proseStyleRow('a.md', '- Run `a; b; c` and `never` `never` `never` or "never" `a → b`.\n');
  assert.equal(row.chainedBullets, 0);
  assert.equal(row.nevers, 0);
  assert.equal(row.arrowRatio, 0);
  assert.equal(proseStyleRow('skills/x/SKILL.md', '# T\n\n**Bold** goal.\n').goalLine, true);
});

test('a file the routing check hashes is out of scope', () => {
  const root = tempDir('prose-style-');
  fs.mkdirSync(path.join(root, 'hooks'));
  const [hashed] = hashedWholeFiles(root);
  fs.writeFileSync(hashed, '- a → b\n- c → d\n');
  fs.writeFileSync(path.join(root, 'hooks', 'other.md'), '- a → b\n- c → d\n');
  const rows = proseStyleRows([path.join(root, 'hooks')], { exclude: hashedWholeFiles(root) });
  fs.rmSync(root, { recursive: true, force: true });
  assert.deepEqual(rows.map((row) => path.basename(row.path)), ['other.md']);
});
