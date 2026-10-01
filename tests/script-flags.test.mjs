// `isMain(import.meta.url)` tells a script run as `node <file>` from the same
// file imported by a test or another script, through a symlink too.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FLAGS_URL = pathToFileURL(fileURLToPath(new URL('../lib/script-flags.mjs', import.meta.url))).href;

function makeProbe() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-is-main-'));
  const probe = path.join(directory, 'probe.mjs');
  fs.writeFileSync(
    probe,
    `import { isMain } from '${FLAGS_URL}';\nprocess.stdout.write(isMain(import.meta.url) ? 'main' : 'imported');\n`
  );
  return { directory, probe };
}

function run(args) {
  return spawnSync(process.execPath, args, { encoding: 'utf8' }).stdout;
}

test('isMain is true when the module is the process entry', () => {
  const { directory, probe } = makeProbe();
  assert.equal(run([probe]), 'main');
  fs.rmSync(directory, { recursive: true, force: true });
});

test('isMain is true when the entry is a symlink to the module', () => {
  const { directory, probe } = makeProbe();
  const link = path.join(directory, 'link.mjs');
  fs.symlinkSync(probe, link);
  assert.equal(run([link]), 'main');
  fs.rmSync(directory, { recursive: true, force: true });
});

test('isMain is false when another module is the entry', () => {
  const { directory, probe } = makeProbe();
  const importer = path.join(directory, 'importer.mjs');
  fs.writeFileSync(importer, `await import('${pathToFileURL(probe).href}');\n`);
  assert.equal(run([importer]), 'imported');
  fs.rmSync(directory, { recursive: true, force: true });
});

test('isMain is false with no entry script', () => {
  const { directory, probe } = makeProbe();
  const source = `import(${JSON.stringify(pathToFileURL(probe).href)})`;
  assert.equal(run(['--input-type=module', '-e', source]), 'imported');
  fs.rmSync(directory, { recursive: true, force: true });
});
