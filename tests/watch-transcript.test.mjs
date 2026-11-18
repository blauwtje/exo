import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { scratchPath } from '../lib/scratch-path.mjs';
import { parseVtt } from '../skills/watch/scripts/transcript.mjs';
import { run, tempDir } from './harness.mjs';

const SCRIPT = path.resolve('skills/watch/scripts/transcript.mjs');
const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhello <c>there</c>\n\n01:02:03.000 --> 01:02:04.000\nbye\n';

test('cues keep their start second and drop markup', () => {
  assert.deepEqual(parseVtt(VTT), [{ start: 1, text: 'hello there' }, { start: 3723, text: 'bye' }]);
});

test('captions from yt-dlp become a stamped transcript on disk', async () => {
  const bin = tempDir('watch-bin-');
  const stub = path.join(bin, 'yt-dlp');
  fs.writeFileSync(stub, `#!/bin/sh
case "$*" in
  *--version*) echo 1;;
  *--dump-json*) echo '{"title":"T","duration":10,"subtitles":{"en":[{}]},"extractor":"youtube"}';;
  *) while [ $# -gt 0 ]; do [ "$1" = "-P" ] && dir="$2"; shift; done; printf '%b' '${VTT.replaceAll('\n', '\\n')}' > "$dir/captions.en.vtt";;
esac
`, { mode: 0o755 });
  const cwd = fs.realpathSync(tempDir('watch-cwd-'));
  const temp = fs.realpathSync(tempDir('watch-tmp-'));
  const result = await run(SCRIPT, ['--url', 'https://youtu.be/abcdefghijk'], { cwd, env: { ...process.env, EXO_YTDLP: stub, TMPDIR: temp, TMP: temp, TEMP: temp } });
  assert.equal(result.code ?? 0, 0, result.stderr);
  assert.match(result.stdout, /id=abcdefghijk .*captions=manual/);
  const outerTmpdir = process.env.TMPDIR;
  process.env.TMPDIR = temp;
  const folder = scratchPath(cwd, 'watch/abcdefghijk');
  process.env.TMPDIR = outerTmpdir;
  const text = fs.readFileSync(path.join(folder, 'transcript.txt'), 'utf8');
  assert.match(text, /^\[0:01\]\(https:\/\/youtu\.be\/abcdefghijk\?t=1\) hello there/);
});
