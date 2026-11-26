import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { gitRepository, run, tempDir } from './harness.mjs';

const BRIEF_PLACE = new URL('../skills/spec/scripts/brief-place.mjs', import.meta.url).pathname;

function ghStub(author, login) {
  const stubs = tempDir('exo-gh-');
  const script = `#!/bin/sh\nif [ "$1" = issue ]; then echo ${author}; else echo ${login}; fi\n`;
  fs.writeFileSync(path.join(stubs, 'gh'), script, { mode: 0o755 });
  return `${stubs}${path.delimiter}${process.env.PATH}`;
}

async function place(mode, extra = [], env = {}, files = { 'package.json': '{"scripts":{"test":"x","check":"y"}}' }) {
  const root = await gitRepository(files);
  const result = await run(BRIEF_PLACE, ['--topic', 'demo', ...extra], { cwd: root, env: { CLAUDE_PLUGIN_OPTION_SPECS: mode, ...env } });
  assert.equal(result.code, 0, result.stderr);
  return result.stdout;
}

test('docs mode prints the folder path, the scratch copy and the first land gate script', async () => {
  const out = await place('docs');
  assert.match(out, /^Mode: docs$/m);
  assert.match(out, /^Brief: docs\/specs\/demo\.md$/m);
  assert.match(out, /^Scratch: .*specs[\\/]demo\.md$/m);
  assert.match(out, /^Land gate: npm run check$/m);
});

test('issues mode has no brief path, and a project without scripts has no land gate', async () => {
  const out = await place('issues', [], {}, { 'README.md': 'x' });
  assert.match(out, /^Mode: issues$/m);
  assert.match(out, /^Brief: none$/m);
  assert.match(out, /^Land gate: none$/m);
});

test('--issue compares the issue author with the signed-in login', async () => {
  assert.match(await place('both', ['--issue', '7'], { PATH: ghStub('me', 'me') }), /^Issue author: same$/m);
  assert.match(await place('both', ['--issue', '7'], { PATH: ghStub('you', 'me') }), /^Issue author: other$/m);
  assert.match(await place('both', ['--issue', '7'], { PATH: ghStub('', '') }), /^Issue author: unknown$/m);
});
