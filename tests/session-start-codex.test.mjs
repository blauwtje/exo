// Given a Codex-shaped SessionStart input with EXO_HOST=codex, the hook adds the
// host note and the scannable style to the context, writes its pointer and
// marker under the Codex home, and leaves the Claude config folder alone.

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

test('a Codex run injects the note and the style after the existing context and writes under .codex/exo', () => {
  const { home, output } = run({ EXO_HOST: 'codex' });
  try {
    const context = output.hookSpecificOutput.additionalContext;
    const settings = context.indexOf('exo settings:');
    const note = context.indexOf('# exo on Codex');
    const style = context.indexOf('I scan:');
    assert.ok(settings >= 0 && settings < note && note < style, `${settings} ${note} ${style}`);
    assert.ok(context.includes(`The exo root is \`${REPOSITORY}\``), 'root not filled');
    assert.ok(!context.includes('{root}'), 'a placeholder is left');
    assert.match(context, /Start every command that runs a script under `[^`]+` with `EXO_HOST=codex`/);
    assert.ok(Buffer.byteLength(context) / 4 <= 5000, `${Buffer.byteLength(context)} bytes`);
    assert.match(output.systemMessage, /run \$start .*\$configure/);
    const folder = path.join(home, '.codex', 'exo');
    assert.equal(fs.readFileSync(path.join(folder, 'plugin-root'), 'utf8'), `${REPOSITORY}\n`);
    assert.ok(fs.existsSync(path.join(folder, 'welcomed')));
    assert.equal(fs.existsSync(path.join(home, '.claude', 'exo')), false, 'the Claude folder was touched');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('CODEX_HOME moves the pointer and marker', () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-codex-set-'));
  const { home } = run({ EXO_HOST: 'codex', CODEX_HOME: codexHome });
  try {
    assert.ok(fs.existsSync(path.join(codexHome, 'exo', 'plugin-root')));
    assert.ok(fs.existsSync(path.join(codexHome, 'exo', 'welcomed')));
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

test('a Claude run gets no note, no style and the slash welcome', () => {
  const { home, output } = run({ EXO_HOST: 'claude' });
  try {
    const context = output.hookSpecificOutput.additionalContext;
    assert.ok(!context.includes('# exo on Codex'));
    assert.ok(!context.includes('I scan:'));
    assert.match(output.systemMessage, /\/exo:start/);
    assert.ok(fs.existsSync(path.join(home, '.claude', 'exo', 'plugin-root')));
    assert.equal(fs.existsSync(path.join(home, '.codex')), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
