import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { run, tempDir } from './harness.mjs';

const SCRIPT = path.resolve('skills/watch/scripts/transcript.mjs');
const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhello there\n';

test('two facebook watch urls do not share a kept transcript', async () => {
  const bin = tempDir('watch-bin-');
  const stub = path.join(bin, 'yt-dlp');
  const calls = path.join(bin, 'calls.txt');
  fs.writeFileSync(stub, `#!/bin/sh
case "$*" in
  *--version*) echo 1;;
  *--dump-json*) echo call >> '${calls}'; echo '{"title":"T","duration":10,"subtitles":{"en":[{}]},"extractor":"facebook"}';;
  *) echo call >> '${calls}'; while [ $# -gt 0 ]; do [ "$1" = "-P" ] && dir="$2"; shift; done; printf '%b' '${VTT.replaceAll('\n', '\\n')}' > "$dir/captions.en.vtt";;
esac
`, { mode: 0o755 });
  const store = fs.realpathSync(tempDir('watch-store-'));
  const count = () => (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').split('\n').filter(Boolean).length : 0);
  const go = async (url) => {
    const cwd = fs.realpathSync(tempDir('watch-cwd-'));
    const temp = fs.realpathSync(tempDir('watch-tmp-'));
    const result = await run(SCRIPT, ['--url', url], { cwd, env: { ...process.env, EXO_YTDLP: stub, EXO_WATCH_STORE: store, TMPDIR: temp, TMP: temp, TEMP: temp } });
    assert.equal(result.code ?? 0, 0, result.stderr);
  };
  await go('https://www.facebook.com/watch/?v=111111');
  assert.equal(count(), 2);
  await go('https://www.facebook.com/watch/?v=222222');
  assert.equal(count(), 4, 'the second video was served from the first one\'s kept transcript');
});
