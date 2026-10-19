import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { descriptionHashes } from '../benchmarks/routing.mjs';
import { checkRouting } from '../verify/checks/routing.mjs';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';

function fixture(description) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'routing-check-'));
  fs.mkdirSync(path.join(root, 'skills', 'build'), { recursive: true });
  fs.mkdirSync(path.join(root, 'hooks'));
  fs.mkdirSync(path.join(root, 'benchmarks', 'results'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'build', 'SKILL.md'), `---\nname: build\ndescription: ${description}\n---\nbody\n`);
  fs.writeFileSync(path.join(root, 'hooks', 'session-routing.md'), 'routing\n');
  return root;
}

function run(root) {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(line);
  try { checkRouting(createReport(), createRepository(root)); } finally { console.log = original; }
  return lines.join('\n');
}

const record = (root, hashes) => fs.writeFileSync(path.join(root, 'benchmarks', 'results', 'routing.json'), JSON.stringify({ hashes }));

test('passes when recorded hashes match', () => {
  const root = fixture('Build things.');
  record(root, descriptionHashes(root));
  assert.match(run(root), /^\[PASS\] routing/);
});

test('fails on a missing result file and names the rerun command', () => {
  assert.match(run(fixture('Build things.')), /\[FAIL\] routing.*missing.*node benchmarks\/routing\.mjs/);
});

test('fails on a missing key', () => {
  const root = fixture('Build things.');
  const { build } = descriptionHashes(root);
  record(root, { build });
  assert.match(run(root), /\[FAIL\] routing.*session-routing \(missing\).*node benchmarks\/routing\.mjs/);
});

test('fails on a changed hash and names the key', () => {
  const root = fixture('Build things.');
  record(root, descriptionHashes(root));
  fs.writeFileSync(path.join(root, 'skills', 'build', 'SKILL.md'), '---\nname: build\ndescription: Build other things.\n---\nbody\n');
  assert.match(run(root), /\[FAIL\] routing.*build \(changed\).*node benchmarks\/routing\.mjs/);
});
