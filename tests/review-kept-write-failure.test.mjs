import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { run, tempDir } from './harness.mjs';

const SCRIPT = path.resolve('skills/watch/scripts/transcript.mjs');
const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhello there\n';

test('an unwritable store does not lose a fetched transcript line', async () => {
  const bin = tempDir('watch-bin-');
  const stub = path.join(bin, 'yt-dlp');
  fs.writeFileSync(stub, `#!/bin/sh
case "$*" in
  *--version*) echo 1;;
  *--dump-json*) echo '{"title":"T","duration":10,"subtitles":{"en":[{}]},"extractor":"youtube"}';;
  *) while [ $# -gt 0 ]; do [ "$1" = "-P" ] && dir="$2"; shift; done; printf '%b' '${VTT.replaceAll('\n', '\\n')}' > "$dir/captions.en.vtt";;
esac
`, { mode: 0o755 });
  const blocked = path.join(tempDir('watch-store-'), 'not-a-folder');
  fs.writeFileSync(blocked, '');
  const cwd = fs.realpathSync(tempDir('watch-cwd-'));
  const temp = fs.realpathSync(tempDir('watch-tmp-'));
  const result = await run(SCRIPT, ['--url', 'https://youtu.be/abcdefghijk'], { cwd, env: { ...process.env, EXO_YTDLP: stub, TMPDIR: temp, TMP: temp, TEMP: temp, EXO_WATCH_STORE: blocked } });
  assert.match(result.stdout, /id=abcdefghijk .*transcript=/, `stdout: ${result.stdout} stderr: ${result.stderr} code: ${result.code}`);
  assert.match(result.stdout, /next=read/);
});
