import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { banner } from '../src/app.mjs';
import { DEFAULTS, loadSettings } from '../src/settings.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'settings-hidden-'));
let counter = 0;

function settingsFile(text) {
  counter += 1;
  const file = path.join(dir, `settings-${counter}.json`);
  writeFileSync(file, text);
  return file;
}

test('a missing file gives the defaults', () => {
  assert.deepEqual(loadSettings(path.join(dir, 'absent.json')), { theme: 'light', pageSize: 20 });
});

test('banner works without a settings file', () => {
  assert.equal(banner(path.join(dir, 'absent.json')), 'theme=light pageSize=20');
});

test('defaults are returned as a copy', () => {
  const first = loadSettings(path.join(dir, 'absent.json'));
  first.theme = 'changed';
  assert.equal(loadSettings(path.join(dir, 'absent.json')).theme, 'light');
  assert.equal(DEFAULTS.theme, 'light');
});

test('malformed JSON names the file and the parse problem', () => {
  const file = settingsFile('{"theme": ');
  assert.throws(() => loadSettings(file), (error) => {
    assert.match(error.message, new RegExp(`^invalid settings file ${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: `));
    assert.ok(error.message.length > `invalid settings file ${file}: `.length);
    return true;
  });
});

test('an empty file is malformed JSON', () => {
  assert.throws(() => loadSettings(settingsFile('')), /^Error: invalid settings file /);
});

test('an array is rejected', () => {
  const file = settingsFile('[1, 2]');
  assert.throws(() => loadSettings(file), (error) => error.message === `settings file ${file} must hold a JSON object`);
});

test('null and scalars are rejected', () => {
  for (const text of ['null', '42', '"dark"', 'true']) {
    const file = settingsFile(text);
    assert.throws(() => loadSettings(file), (error) => error.message === `settings file ${file} must hold a JSON object`, text);
  }
});

test('other read errors are not hidden', () => {
  assert.throws(() => loadSettings(dir), (error) => error.code === 'EISDIR');
});

test('valid files still merge over the defaults', () => {
  assert.deepEqual(loadSettings(settingsFile('{"theme":"dark"}')), { theme: 'dark', pageSize: 20 });
});
