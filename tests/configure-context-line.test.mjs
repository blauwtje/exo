import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { contextLimit } from '../lib/context-limits.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const script = path.join(repo, 'skills', 'configure', 'scripts', 'settings.mjs');

function homeWith(content) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-context-line-'));
  if (content !== undefined) {
    fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
    fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), content);
  }
  return home;
}

function contextLine(home) {
  const result = spawnSync(process.execPath, [script, 'context'], {
    encoding: 'utf8',
    cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'exo-context-line-cwd-')),
    env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude'), EXO_HOST: 'claude' }
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('the settings line shows the context limit from the user run.json as global', () => {
  assert.match(contextLine(homeWith('{"defaults":{"contextLimit":150000}}')), /context=150k \(global\)/);
});

test('the settings line shows the shipped context limit as default without a run.json', () => {
  const shipped = Math.round(contextLimit(homeWith()) / 1000);
  assert.match(contextLine(homeWith()), new RegExp(`context=${shipped}k \\(default\\)`));
});
