import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { banner } from '../src/app.mjs';
import { loadSettings } from '../src/settings.mjs';

function settingsFile(text) {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'settings-')), 'settings.json');
  writeFileSync(file, text);
  return file;
}

test('file values override the defaults', () => {
  assert.deepEqual(loadSettings(settingsFile('{"theme":"dark"}')), { theme: 'dark', pageSize: 20 });
});

test('banner shows the merged settings', () => {
  assert.equal(banner(settingsFile('{"pageSize":50}')), 'theme=light pageSize=50');
});

test('a missing file gives the defaults', () => {
  assert.deepEqual(loadSettings('/nonexistent/settings.json'), { theme: 'light', pageSize: 20 });
});
