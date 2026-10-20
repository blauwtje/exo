import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkSpeedLedger } from '../verify/checks/speed-ledger.mjs';
import { createRepository } from '../verify/repository.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function verifyLedger(edit) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
  fs.mkdirSync(path.join(root, 'benchmarks'));
  for (const name of ['speed-ledger.jsonl', 'speed-ledger.md']) fs.copyFileSync(path.join(ROOT, 'benchmarks', name), path.join(root, 'benchmarks', name));
  fs.cpSync(path.join(ROOT, 'benchmarks', 'results'), path.join(root, 'benchmarks', 'results'), { recursive: true });
  edit(path.join(root, 'benchmarks'));
  const results = [];
  const report = { result: (status, name, detail) => results.push(`[${status}] ${name}: ${detail}`) };
  checkSpeedLedger(report, createRepository(root));
  return results;
}

test('a rendered ledger passes', () => {
  const lines = verifyLedger(() => {});
  assert.deepEqual(lines.map((line) => line.slice(0, 6)), ['[PASS]']);
});

test('a stale markdown view fails with the render command', () => {
  const lines = verifyLedger((dir) => fs.appendFileSync(path.join(dir, 'speed-ledger.md'), 'stale\n'));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[FAIL\].*--render/);
});

test('each ledger problem is its own FAIL line', () => {
  const lines = verifyLedger((dir) => fs.appendFileSync(path.join(dir, 'speed-ledger.jsonl'), 'not json\n{"id":"x"}\n'));
  assert.ok(lines.length >= 2, lines.join('\n'));
  assert.ok(lines.every((line) => line.startsWith('[FAIL]')));
});

test('a null title and a missing markdown view are FAIL lines, not a throw', () => {
  const nulled = verifyLedger((dir) => {
    const file = path.join(dir, 'speed-ledger.jsonl');
    const [first, ...rest] = fs.readFileSync(file, 'utf8').split('\n');
    fs.writeFileSync(file, [JSON.stringify({ ...JSON.parse(first), title: null }), ...rest].join('\n'));
  });
  assert.match(nulled.join('\n'), /^\[FAIL\].*title is not a string/);
  const bare = verifyLedger((dir) => fs.rmSync(path.join(dir, 'speed-ledger.md')));
  assert.match(bare.join('\n'), /^\[FAIL\].*speed-ledger\.md is missing/);
});
