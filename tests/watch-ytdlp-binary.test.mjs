import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { resolveYtDlp } from '../skills/watch/scripts/ytdlp-binary.mjs';
import { ytDlpNeed } from '../skills/watch/scripts/ytdlp.mjs';
import './watch-gate-env.mjs';
import { tempDir } from './harness.mjs';

function sandbox() {
  const dir = fs.realpathSync(tempDir('ytdlp-binary-'));
  const empty = path.join(dir, 'empty');
  fs.mkdirSync(empty);
  return { dir, empty };
}

test('a yt-dlp on PATH is used', () => {
  const { dir } = sandbox();
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'yt-dlp'), '#!/bin/sh\n', { mode: 0o755 });
  assert.deepEqual(resolveYtDlp({ env: { PATH: bin }, platform: 'linux' }), { command: 'yt-dlp' });
});

test('EXO_YTDLP names the binary and skips PATH', () => {
  const { empty } = sandbox();
  assert.deepEqual(resolveYtDlp({ env: { PATH: empty, EXO_YTDLP: '/opt/tools/yt-dlp' } }), { command: '/opt/tools/yt-dlp' });
});

test('a missing yt-dlp is not downloaded and creates no cache', () => {
  const { dir, empty } = sandbox();
  const data = path.join(dir, 'data');
  const env = { PATH: empty, CLAUDE_PLUGIN_DATA: data };
  assert.deepEqual(resolveYtDlp({ env, platform: 'darwin' }), { command: null });
  assert.ok(!fs.existsSync(data));
});

test('the missing tool line names the install command and no failed fetch', async () => {
  const { empty } = sandbox();
  const saved = { PATH: process.env.PATH, EXO_YTDLP: process.env.EXO_YTDLP };
  process.env.PATH = empty;
  delete process.env.EXO_YTDLP;
  const need = await ytDlpNeed().finally(() => {
    process.env.PATH = saved.PATH;
    if (saved.EXO_YTDLP !== undefined) process.env.EXO_YTDLP = saved.EXO_YTDLP;
  });
  assert.equal(need, "yt-dlp on PATH; install it with 'brew install yt-dlp' or 'pipx install yt-dlp'");
});
