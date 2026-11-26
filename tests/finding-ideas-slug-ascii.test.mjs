import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const SCRIPT = path.resolve('skills/ideas/scripts/run-init.mjs');

test('a question without ASCII letters or digits still creates a run folder', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ideas-slug-'));
  const result = spawnSync(process.execPath, [SCRIPT, '--question', 'как улучшить кэш?', '--home', home], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^RUN=/);
  assert.ok(fs.existsSync(result.stdout.trim().slice('RUN='.length)));
  fs.rmSync(home, { recursive: true, force: true });
});
