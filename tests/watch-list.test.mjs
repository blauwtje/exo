import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { run, tempDir } from './harness.mjs';

const SCRIPT = path.resolve('skills/watch/scripts/list.mjs');

function stubWith(entry) {
  const stub = path.join(tempDir('watch-list-bin-'), 'yt-dlp');
  fs.writeFileSync(stub, `#!/bin/sh
case "$*" in
  *--version*) echo 1;;
  *youtubetab:approximate_date*) echo '{"entries":[${JSON.stringify(entry)}]}';;
  *) echo '{"entries":[{"id":"abcdefghijk","title":"T","url":"https://youtu.be/abcdefghijk"}]}';;
esac
`, { mode: 0o755 });
  return stub;
}

async function list(entry) {
  const result = await run(SCRIPT, ['--url', 'https://www.youtube.com/@x/videos'], { env: { ...process.env, EXO_YTDLP: stubWith(entry) } });
  assert.equal(result.code ?? 0, 0, result.stderr);
  return result.stdout.trim();
}

test('a flat entry with only a timestamp prints its UTC date', async () => {
  const out = await list({ id: 'abcdefghijk', title: 'T', url: 'https://youtu.be/abcdefghijk', timestamp: 1795453020 });
  assert.equal(out, 'https://youtu.be/abcdefghijk | T | 2026-11-23');
});

test('upload_date wins over timestamp', async () => {
  const out = await list({ id: 'abcdefghijk', title: 'T', url: 'https://youtu.be/abcdefghijk', upload_date: '20250102', timestamp: 1795453020 });
  assert.equal(out, 'https://youtu.be/abcdefghijk | T | 2025-01-02');
});
