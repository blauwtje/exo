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

const cue = (start, end, ...lines) => `${start} --> ${end}\n${lines.join('\n')}\n\n`;

test('rolling auto captions keep each spoken line once', () => {
  const vtt = 'WEBVTT\n\n'
    + cue('00:00:01.000', '00:00:03.000', 'we are going to be', 'talking<c> about</c> models')
    + cue('00:00:03.000', '00:00:03.010', 'talking about models', ' ')
    + cue('00:00:03.010', '00:00:05.000', 'talking about models', 'so pick one')
    + cue('00:00:05.000', '00:00:06.000', 'talking about models so pick one now');
  assert.deepEqual(parseVtt(vtt), [
    { start: 1, text: 'we are going to be talking about models' },
    { start: 3, text: 'so pick one' },
    { start: 5, text: 'now' }
  ]);
});

test('a phrase repeated in a later, non-overlapping cue stays', () => {
  const vtt = 'WEBVTT\n\n'
    + cue('00:00:01.000', '00:00:02.000', 'no way')
    + cue('00:00:02.000', '00:00:03.000', 'really')
    + cue('00:00:03.000', '00:00:04.000', 'no way');
  assert.deepEqual(parseVtt(vtt).map((c) => c.text), ['no way', 'really', 'no way']);
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

test('an auto caption track in the spoken language is read from its -orig track', async () => {
  const bin = tempDir('watch-bin-');
  const stub = path.join(bin, 'yt-dlp');
  const asked = path.join(bin, 'asked.txt');
  fs.writeFileSync(stub, `#!/bin/sh
case "$*" in
  *--version*) echo 1;;
  *--dump-json*) echo '{"title":"T","duration":10,"language":"en-US","subtitles":{},"automatic_captions":{"en-orig":[{}],"en":[{}],"es-orig":[{}]},"extractor":"youtube"}';;
  *) while [ $# -gt 0 ]; do [ "$1" = "-P" ] && dir="$2"; [ "$1" = "--sub-langs" ] && echo "$2" > '${asked}'; shift; done; printf '%b' '${VTT.replaceAll('\n', '\\n')}' > "$dir/captions.en-orig.vtt";;
esac
`, { mode: 0o755 });
  const cwd = fs.realpathSync(tempDir('watch-cwd-'));
  const temp = fs.realpathSync(tempDir('watch-tmp-'));
  const result = await run(SCRIPT, ['--url', 'https://youtu.be/abcdefghijk'], { cwd, env: { ...process.env, EXO_YTDLP: stub, TMPDIR: temp, TMP: temp, TEMP: temp } });
  assert.equal(result.code ?? 0, 0, result.stderr);
  assert.match(result.stdout, /captions=auto/);
  assert.equal(fs.readFileSync(asked, 'utf8').trim(), 'en-orig');
});

test('auto captions without any -orig track are spoken tracks', async () => {
  const bin = tempDir('watch-bin-');
  const stub = path.join(bin, 'yt-dlp');
  fs.writeFileSync(stub, `#!/bin/sh
case "$*" in
  *--version*) echo 1;;
  *--dump-json*) echo '{"title":"T","duration":10,"subtitles":{},"automatic_captions":{"en_US":[{}]},"extractor":"facebook"}';;
  *) while [ $# -gt 0 ]; do [ "$1" = "-P" ] && dir="$2"; shift; done; printf '%b' '${VTT.replaceAll('\n', '\\n')}' > "$dir/captions.en_US.vtt";;
esac
`, { mode: 0o755 });
  const cwd = fs.realpathSync(tempDir('watch-cwd-'));
  const temp = fs.realpathSync(tempDir('watch-tmp-'));
  const result = await run(SCRIPT, ['--url', 'https://www.facebook.com/watch/?v=123456'], { cwd, env: { ...process.env, EXO_YTDLP: stub, TMPDIR: temp, TMP: temp, TEMP: temp } });
  assert.equal(result.code ?? 0, 0, result.stderr);
  assert.match(result.stdout, /captions=auto/);
});

test('the YouTube bot check counts as rate-limited', async () => {
  const bin = tempDir('watch-bin-');
  const stub = path.join(bin, 'yt-dlp');
  fs.writeFileSync(stub, `#!/bin/sh
case "$*" in
  *--version*) echo 1;;
  *) echo "ERROR: [youtube] abcdefghijk: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication." >&2; exit 1;;
esac
`, { mode: 0o755 });
  const cwd = fs.realpathSync(tempDir('watch-cwd-'));
  const temp = fs.realpathSync(tempDir('watch-tmp-'));
  const result = await run(SCRIPT, ['--url', 'https://youtu.be/abcdefghijk'], { cwd, env: { ...process.env, EXO_YTDLP: stub, TMPDIR: temp, TMP: temp, TEMP: temp } });
  assert.equal(result.code, 75, result.stderr);
  assert.match(result.stderr, /rate-limited, retry later: https:\/\/youtu\.be\/abcdefghijk/);
});

test('whisper-cli gets a 16 kHz wav converted from the downloaded audio', async () => {
  const bin = tempDir('watch-bin-');
  const ytdlp = path.join(bin, 'yt-dlp');
  fs.writeFileSync(ytdlp, `#!/bin/sh
case "$*" in
  *--version*) echo 1;;
  *--dump-json*) echo '{"title":"T","duration":10,"extractor":"youtube"}';;
  *) while [ $# -gt 0 ]; do [ "$1" = "-P" ] && dir="$2"; shift; done; echo opus > "$dir/audio.webm";;
esac
`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'ffmpeg'), `#!/bin/sh
for last; do :; done
case "$*" in *"-ar 16000 -ac 1"*) echo wav > "$last";; *) exit 1;; esac
`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'whisper-cli'), `#!/bin/sh
while [ $# -gt 0 ]; do [ "$1" = "-f" ] && input="$2"; [ "$1" = "-of" ] && out="$2"; shift; done
case "$input" in *.wav) printf '%b' '${VTT.replaceAll('\n', '\\n')}' > "$out.vtt";; *) echo "1 input file(s) failed" >&2; exit 1;; esac
`, { mode: 0o755 });
  const cwd = fs.realpathSync(tempDir('watch-cwd-'));
  const temp = fs.realpathSync(tempDir('watch-tmp-'));
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, EXO_YTDLP: ytdlp, EXO_WHISPER_MODEL: 'model.bin', TMPDIR: temp, TMP: temp, TEMP: temp };
  const result = await run(SCRIPT, ['--url', 'https://youtu.be/abcdefghijk'], { cwd, env });
  assert.equal(result.code ?? 0, 0, result.stderr);
  assert.match(result.stdout, /id=abcdefghijk .*speech:whisper-cli/);
});
