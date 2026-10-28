import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { FLOW_HELPERS } from '../benchmarks/sweep-fixtures.mjs';

const HIDDEN = fileURLToPath(new URL('../benchmarks/flow-hidden/', import.meta.url));

function hiddenFile(helper) {
  return `${path.basename(helper.module, '.js')}.test.js`;
}

function hiddenTestPasses(helper, withReference) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-flow-reference-'));
  try {
    fs.mkdirSync(path.join(directory, 'src'));
    fs.mkdirSync(path.join(directory, '.flow-hidden'));
    if (withReference) fs.writeFileSync(path.join(directory, helper.module), `${helper.code.join('\n')}\n`);
    const target = path.join('.flow-hidden', hiddenFile(helper));
    fs.copyFileSync(path.join(HIDDEN, hiddenFile(helper)), path.join(directory, target));
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    return spawnSync(process.execPath, ['--test', target], { cwd: directory, env, timeout: 60_000 }).status === 0;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

for (const helper of FLOW_HELPERS) {
  test(`${hiddenFile(helper)} passes with the reference helper`, () => {
    assert.equal(hiddenTestPasses(helper, true), true);
  });

  test(`${hiddenFile(helper)} fails without the reference helper`, () => {
    assert.equal(hiddenTestPasses(helper, false), false);
  });
}
