// Given a Codex-shaped SessionStart input with EXO_HOST=codex, the hook adds the
// host note after the settings line, writes its pointer under the Codex home,
// shows no welcome, and leaves the Claude config folder alone.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HOOK = path.join(REPOSITORY, 'hooks', 'session-start.mjs');

function run(extra, input = { session_id: 's1', source: 'startup', cwd: os.tmpdir() }) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-codex-home-'));
  const env = { ...process.env, HOME: home, ...extra };
  delete env.CLAUDE_CONFIG_DIR;
  delete env.CODEX_HOME;
  Object.assign(env, extra);
  const output = execFileSync(process.execPath, [HOOK], { env, input: JSON.stringify(input) }).toString();
  return { home, output: JSON.parse(output) };
}

test('a Codex run injects the note after the existing context and writes under .codex/exo', () => {
  const { home, output } = run({ EXO_HOST: 'codex' });
  try {
    const context = output.hookSpecificOutput.additionalContext;
    const settings = context.indexOf('exo settings:');
    const note = context.indexOf('# exo on Codex');
    assert.ok(settings >= 0 && settings < note, `${settings} ${note}`);
    assert.ok(context.includes(`The exo root is \`${REPOSITORY}\``), 'root not filled');
    assert.ok(!context.includes('{root}'), 'a placeholder is left');
    assert.ok(!context.includes('EXO_HOST=codex'), 'the note still names the host prefix');
    assert.ok(Buffer.byteLength(context) / 4 <= 5000, `${Buffer.byteLength(context)} bytes`);
    assert.equal(output.systemMessage, undefined, 'a welcome is shown');
    const folder = path.join(home, '.codex', 'exo');
    assert.equal(fs.readFileSync(path.join(folder, 'plugin-root'), 'utf8'), `${REPOSITORY}\n`);
    assert.equal(fs.existsSync(path.join(folder, 'welcomed')), false, 'a welcomed marker is written');
    assert.equal(fs.existsSync(path.join(home, '.claude', 'exo')), false, 'the Claude folder was touched');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('CODEX_HOME moves the pointer', () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-codex-set-'));
  const { home } = run({ EXO_HOST: 'codex', CODEX_HOME: codexHome });
  try {
    assert.ok(fs.existsSync(path.join(codexHome, 'exo', 'plugin-root')));
    assert.equal(fs.existsSync(path.join(codexHome, 'exo', 'welcomed')), false);
    assert.equal(fs.existsSync(path.join(home, '.codex')), false);
    assert.equal(fs.existsSync(path.join(home, '.claude', 'exo')), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(codexHome, { recursive: true, force: true });
  }
});

test('a clear on Codex also leaves the Claude folder alone', () => {
  const { home } = run({ EXO_HOST: 'codex' }, { session_id: 's2', source: 'clear', cwd: os.tmpdir() });
  try {
    assert.equal(fs.existsSync(path.join(home, '.claude', 'exo')), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('a Claude run gets the settings line, no Codex note and no welcome', () => {
  const { home, output } = run({ EXO_HOST: 'claude' });
  try {
    const context = output.hookSpecificOutput.additionalContext;
    assert.ok(context.includes('exo settings:'));
    assert.ok(!context.includes('# exo on Codex'));
    assert.equal(output.systemMessage, undefined);
    assert.ok(fs.existsSync(path.join(home, '.claude', 'exo', 'plugin-root')));
    assert.equal(fs.existsSync(path.join(home, '.codex')), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
