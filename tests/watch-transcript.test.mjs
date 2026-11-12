import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { decodeEntities, parseTimedText, parseVtt } from '../skills/watch/scripts/cues.mjs';
import { formatDuration, formatStamp, renderTranscript, countWords } from '../skills/watch/scripts/format.mjs';
import { planChunks } from '../skills/watch/scripts/chunks.mjs';
import { videoIdOf } from '../skills/watch/scripts/video-url.mjs';
import { tracksOf, pickTrack, languagesOf } from '../skills/watch/scripts/youtube.mjs';
import { chaptersFromHtml } from '../skills/watch/scripts/youtube-chapters.mjs';
import { watchGuarded, watchOne } from '../skills/watch/scripts/watch.mjs';
import './watch-gate-env.mjs';
import { tempDir } from './harness.mjs';

process.env.CLAUDE_PLUGIN_DATA = tempDir('plugin-data-');
globalThis.fetch = async () => { throw new Error('network blocked in tests'); };

const script = path.resolve('skills/watch/scripts/transcript.mjs');

const SPACE = ' ';
const TRACK = [{ ext: 'vtt' }];

const AUTO_VTT = `WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:02.000 align:start position:0%
${SPACE}
Hello<00:00:00.500><c> and</c><00:00:01.000><c> welcome</c>

00:00:02.000 --> 00:00:02.010 align:start position:0%
Hello and welcome
${SPACE}

00:00:02.010 --> 00:00:04.000 align:start position:0%
Hello and welcome
to<00:00:02.500><c> the</c><00:00:03.000><c> show</c>

00:00:04.000 --> 00:00:04.010 align:start position:0%
to the show
${SPACE}

00:00:04.010 --> 00:00:06.000 align:start position:0%
to the show
Tom &amp; Jerry &lt;3 it

00:01:30.000 --> 00:01:32.000
<c.colorE5E5E5>A new</c> thought
`;

const MANUAL_VTT = `WEBVTT

NOTE a comment
spanning two lines

STYLE
::cue { color: red }

intro
00:00:00.000 --> 00:00:02.000
Hello there

2
00:02.000 --> 00:04.000
yeah
yeah

00:00:04.000 --> 00:00:06.000
Tom &amp; Jerry
second line

00:01:30.000 --> 00:01:32.000
A new thought
`;

const MANUAL_TEXT = '[00:00] Hello there yeah yeah Tom & Jerry second line\n\n[01:30] A new thought\n';

function stampText(seconds) {
  const hours = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  return `${hours}:${minutes}:${String(seconds % 60).padStart(2, '0')}.000`;
}

function vttOf(cues) {
  return `WEBVTT\n\n${cues.map(([seconds, text]) => `${stampText(seconds)} --> ${stampText(seconds + 2)}\n${text}`).join('\n\n')}\n`;
}

test('parseVtt drops rolling duplicates, tags and entities for automatic captions', () => {
  const cues = parseVtt(AUTO_VTT, { auto: true });
  assert.deepEqual(cues.map((cue) => cue.text), ['Hello and welcome', 'to the show', 'Tom & Jerry <3 it', 'A new thought']);
  assert.deepEqual(cues.map((cue) => cue.start), [0, 2.01, 4.01, 90]);
});

test('parseVtt keeps real repeats in manual captions and skips ids, NOTE, STYLE and short timings', () => {
  const cues = parseVtt(MANUAL_VTT);
  assert.deepEqual(cues.map((cue) => cue.text), ['Hello there', 'yeah', 'yeah', 'Tom & Jerry', 'second line', 'A new thought']);
  assert.deepEqual(cues.map((cue) => cue.start), [0, 2, 2, 4, 4, 90]);
  assert.deepEqual(parseVtt(MANUAL_VTT.replace(/\n/g, '\r\n')), cues);
});

test('renderTranscript stamps a paragraph about every stamp window', () => {
  const text = renderTranscript(parseVtt(AUTO_VTT, { auto: true }), { stampSeconds: 45 });
  assert.equal(text, '[00:00] Hello and welcome to the show Tom & Jerry <3 it\n\n[01:30] A new thought\n');
});

test('renderTranscript uses h:mm:ss stamps and chapter headings', () => {
  const cues = [{ start: 3700, text: 'late' }, { start: 3800, text: 'later' }];
  const text = renderTranscript(cues, { chapters: [{ start: 3600, title: 'Part two' }], stampSeconds: 60, withHours: true });
  assert.equal(text, '## Part two\n\n[1:01:40] late\n\n[1:03:20] later\n');
});

test('stamps, durations, entities and word counts', () => {
  assert.equal(formatStamp(65, false), '[01:05]');
  assert.equal(formatStamp(3700, false), '[61:40]');
  assert.equal(formatStamp(3725, true), '[1:02:05]');
  assert.equal(formatDuration(3725), '1:02:05');
  assert.equal(decodeEntities('a &#39;b&#39; &#x41; &AMP;'), "a 'b' A &AMP;");
  assert.equal(countWords([{ start: 0, text: 'one two' }, { start: 1, text: 'three' }]), 3);
});

test('decodeEntities decodes once and leaves an impossible code point alone', () => {
  assert.equal(decodeEntities('&amp;#39;'), '&#39;');
  assert.equal(decodeEntities('x &#99999999; &#0; y'), 'x &#99999999; &#0; y');
  assert.equal(decodeEntities('&#x1F600;'), String.fromCodePoint(0x1f600));
});

const spans = (chunks) => chunks.map((chunk) => [chunk.start, chunk.end, chunk.title]);

test('planChunks packs short chapters and splits a long stretch with no chapters', () => {
  const chapters = [
    { start: 0, end: 300, title: 'A' }, { start: 300, end: 700, title: 'B' }, { start: 700, end: 1000, title: 'C' },
  ];
  assert.deepEqual(spans(planChunks(1000, chapters, 600)), [[0, 700, 'A to B'], [700, 1000, 'C']]);
  const parts = planChunks(3600, [], 600);
  assert.equal(parts.length, 6);
  assert.equal(parts[0].start, 0);
  assert.equal(parts[5].end, 3600);
  assert.equal(parts[2].title, 'Part (part 3/6)');
});

test('planChunks titles a packed chunk by its first and last chapter and folds a short tail', () => {
  const chapters = [
    { start: 0, end: 600, title: 'A' }, { start: 600, end: 630, title: 'B' },
    { start: 630, end: 2130, title: 'C' }, { start: 2130, end: 2140, title: 'Outro' },
  ];
  const chunks = planChunks(2140, chapters, 600);
  assert.deepEqual(chunks.map((chunk) => chunk.title), ['A', 'B to Outro (part 1/3)', 'B to Outro (part 2/3)', 'B to Outro (part 3/3)']);
  assert.equal(chunks.at(-1).end, 2140);
});

test('planChunks starts at zero and leaves no gap between chunks', () => {
  const late = planChunks(1500, [{ start: 15, end: 700, title: 'A' }, { start: 700, end: 1500, title: 'B' }], 600);
  assert.equal(late[0].start, 0);
  const gapped = planChunks(1500, [{ start: 0, end: 700, title: 'A' }, { start: 800, end: 1500, title: 'B' }], 600);
  assert.deepEqual(spans(gapped), [[0, 800, 'A'], [800, 1500, 'B']]);
});

const ID = 'abc12345678';
const OTHER_ID = 'xyz98765432';
const TRACK_HOST = 'https://www.youtube.com/api/timedtext';

const MANUAL_XML = `<?xml version="1.0" encoding="utf-8" ?><timedtext format="3">
<body>
<p t="0" d="2000">Hello there</p>
<p t="2000" d="2000">yeah</p>
<p t="2000" d="2000">yeah</p>
<p t="4000" d="2000">Tom &amp; Jerry&#39;s</p>
<p t="90000" d="2000">A <s>new</s> thought</p>
</body></timedtext>`;

const ASR_XML = `<?xml version="1.0" encoding="utf-8" ?><timedtext format="3">
<head><ws id="0"/></head>
<body>
<w t="0" id="1" wp="1" ws="1"/>
<p t="199" d="4721" w="1"><s ac="0">hi</s><s t="240" ac="0"> everyone</s><s t="1240" ac="0"> so</s></p>
<p t="2510" d="2410" w="1" a="1">
</p>
<p t="2520" d="5040" w="1"><s ac="0">hi</s><s t="240" ac="0"> everyone</s><s t="1240" ac="0"> so</s></p>
<p t="5000" d="2000" w="1"><s ac="0">heard</s><s t="200" ac="0"> of</s></p>
</body></timedtext>`;

function track(code, kind, extra = '') {
  const query = `?v=${ID}&lang=${code}${kind ? `&kind=${kind}` : ''}${extra}`;
  return { baseUrl: `${TRACK_HOST}${query}`, languageCode: code, ...(kind ? { kind } : {}) };
}

function playerOf({ tracks = [], title = 'A  talk', length = '120', status = 'OK', reason, audio } = {}) {
  const renderer = tracks.length > 0 ? { captionTracks: tracks, ...(audio ? { audioTracks: [{ audioTrackId: audio }], defaultAudioTrackIndex: 0 } : {}) } : null;
  return {
    playabilityStatus: { status, ...(reason ? { reason } : {}) },
    videoDetails: { videoId: ID, title, lengthSeconds: length },
    ...(renderer ? { captions: { playerCaptionsTracklistRenderer: renderer } } : {}),
  };
}

function marker(title, start) {
  return { macroMarkersListItemRenderer: { title: { simpleText: title }, onTap: { watchEndpoint: { startTimeSeconds: start } } } };
}

function panelOf(markers) {
  return { engagementPanelSectionListRenderer: { content: { macroMarkersListRenderer: { contents: markers } } } };
}

function pageOf(...panels) {
  const data = { engagementPanels: panels.map(panelOf) };
  return `<html><script>var ytInitialData = ${JSON.stringify(data)};</script></html>`;
}

function fakeFetch({ player = playerOf(), page = pageOf([]), files = {}, playerStatus = 200 }) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const address = String(url);
    if (address.includes('/youtubei/v1/player')) return new Response(JSON.stringify(player), { status: playerStatus });
    if (address.includes('/watch?v=')) return new Response(page, { status: 200 });
    const body = files[address];
    return body === undefined ? new Response('', { status: 404 }) : new Response(body, { status: 200 });
  };
  return { fn, calls };
}

function scratch() {
  const dir = fs.realpathSync(tempDir('watch-'));
  return { dir, options: { out: path.join(dir, 'out'), chunkMinutes: 30, stampSeconds: 45, fetchMs: 5000 } };
}

const XML_TEXT = "[00:00] Hello there yeah yeah Tom & Jerry's\n\n[01:30] A new thought\n";
const TIME_LINK = /\(https:\/\/(?:www\.youtube\.com|vimeo\.com)[^)]*\)/g;
const readText = (file) => fs.readFileSync(file, 'utf8').replace(TIME_LINK, '');

test('videoIdOf reads an id, watch, short, embed and youtu.be links and refuses the rest', () => {
  assert.equal(videoIdOf(ID), ID);
  assert.equal(videoIdOf(`https://www.youtube.com/watch?v=${ID}&t=5`), ID);
  assert.equal(videoIdOf(`youtube.com/watch?v=${ID}`), ID);
  assert.equal(videoIdOf(`https://youtu.be/${ID}?si=x`), ID);
  assert.equal(videoIdOf(`https://m.youtube.com/shorts/${ID}`), ID);
  assert.equal(videoIdOf(`https://www.youtube.com/embed/${ID}`), ID);
  assert.equal(videoIdOf(`https://example.com/watch?v=${ID}`), null);
  assert.equal(videoIdOf('short'), null);
  assert.equal(videoIdOf(`${ID}";touch pwned;"`), null);
});

test('parseTimedText reads paragraphs, strips tags, decodes entities and drops empty ones', () => {
  const cues = parseTimedText(MANUAL_XML);
  assert.deepEqual(cues.map((cue) => cue.text), ['Hello there', 'yeah', 'yeah', "Tom & Jerry's", 'A new thought']);
  assert.deepEqual(cues.map((cue) => cue.start), [0, 2, 2, 4, 90]);
});

const CLASSIC_XML = `<?xml version="1.0" encoding="utf-8" ?><transcript>
<text start="0" dur="2.5">Hello there</text>
<text start="2.5" dur="1.5">Tom &amp;amp; Jerry&amp;#39;s</text>
<text start="90.25" dur="2">A <i>new</i> thought</text>
</transcript>`;

test('a classic format-1 caption body parses into the same cues and reaches the transcript', async () => {
  assert.deepEqual(parseTimedText(CLASSIC_XML), [
    { start: 0, text: 'Hello there' },
    { start: 2.5, text: "Tom & Jerry's" },
    { start: 90.25, text: 'A new thought' },
  ]);
  const { options } = scratch();
  const manual = track('en');
  const { fn } = fakeFetch({ player: playerOf({ tracks: [manual] }), files: { [manual.baseUrl]: CLASSIC_XML } });
  const result = await watchOne(ID, options, fn);
  assert.equal(result.failure, undefined);
  assert.equal(readText(path.join(options.out, ID, 'transcript.txt')), "[00:00] Hello there Tom & Jerry's\n\n[01:30] A new thought\n");
});

test('parseTimedText joins word segments, skips the newline paragraphs and drops rolling repeats for automatic captions', () => {
  const cues = parseTimedText(ASR_XML, { auto: true });
  assert.deepEqual(cues, [{ start: 0.199, text: 'hi everyone so' }, { start: 5, text: 'heard of' }]);
  assert.equal(parseTimedText(ASR_XML).length, 3);
});

test('tracksOf keeps only tracks on a youtube.com host and marks the automatic ones', () => {
  const player = playerOf({ tracks: [track('en'), track('en', 'asr'), { baseUrl: 'https://evil.example.com/t?x=1', languageCode: 'fr' }] });
  assert.deepEqual(tracksOf(player).map((entry) => [entry.code, entry.auto]), [['en', false], ['en', true]]);
  assert.deepEqual(tracksOf({}), []);
});

test('pickTrack prefers manual over automatic, then the default audio language, then English', () => {
  const tracks = tracksOf(playerOf({ tracks: [track('de-DE', 'asr'), track('fr'), track('en', 'asr'), track('nl')] }));
  assert.equal(pickTrack(tracks, undefined, 'nl-BE').code, 'nl');
  assert.equal(pickTrack(tracks, undefined, 'de-DE').code, 'fr');
  const autoOnly = tracksOf(playerOf({ tracks: [track('de-DE', 'asr'), track('en', 'asr')] }));
  assert.equal(pickTrack(autoOnly, undefined, 'de').code, 'de-DE');
  assert.equal(pickTrack(autoOnly, undefined, null).code, 'en');
  assert.deepEqual(languagesOf(tracks), ['de-DE', 'fr', 'en', 'nl']);
});

test('pickTrack with a named language takes an exact or same-language track and returns null otherwise', () => {
  const tracks = tracksOf(playerOf({ tracks: [track('en-GB'), track('fr', 'asr')] }));
  assert.equal(pickTrack(tracks, 'en').code, 'en-GB');
  assert.equal(pickTrack(tracks, 'fr-FR').code, 'fr');
  assert.equal(pickTrack(tracks, 'de'), null);
});

test('chaptersFromHtml reads each chapter once, in order, each ending where the next starts', () => {
  const html = pageOf([marker('Later', 600), marker('Intro  start', 0), marker('Middle', 300)]);
  assert.deepEqual(chaptersFromHtml(html, 900), [
    { start: 0, end: 300, title: 'Intro start' },
    { start: 300, end: 600, title: 'Middle' },
    { start: 600, end: 900, title: 'Later' },
  ]);
  assert.deepEqual(chaptersFromHtml('<html></html>', 900), []);
  assert.deepEqual(chaptersFromHtml('<script>var ytInitialData = {broken;</script>', 900), []);
});

test('chaptersFromHtml uses the first non-empty engagement panel and ignores the key moments panel', () => {
  const html = pageOf([], [marker('Intro', 0), marker('Main', 600)], [marker('Key moment', 60), marker('Another', 120)]);
  assert.deepEqual(chaptersFromHtml(html, 900), [
    { start: 0, end: 600, title: 'Intro' },
    { start: 600, end: 900, title: 'Main' },
  ]);
});

test('manual captions win over automatic ones and the files land on disk', async () => {
  const { options } = scratch();
  const manual = track('en');
  const { fn, calls } = fakeFetch({ player: playerOf({ tracks: [track('en', 'asr'), manual] }), files: { [manual.baseUrl]: MANUAL_XML } });
  const result = await watchOne(ID, options, fn);
  assert.equal(result.failure, undefined);
  assert.match(result.line, new RegExp(`^id=${ID} title="A talk" duration=0:02:00 captions=manual:en words=10 tokens=13 transcript=`));
  assert.doesNotMatch(result.line, /Hello/);
  assert.equal(readText(path.join(options.out, ID, 'transcript.txt')), XML_TEXT);
  assert.equal(readText(path.join(options.out, ID, 'raw.xml')), MANUAL_XML);
  assert.ok(!fs.existsSync(path.join(options.out, ID, 'chunks')));
  assert.ok(!calls.some((call) => call.url.includes('kind=asr')));
});

test('the player request is an ANDROID client post with the video id', async () => {
  const { options } = scratch();
  const manual = track('en');
  const { fn, calls } = fakeFetch({ player: playerOf({ tracks: [manual] }), files: { [manual.baseUrl]: MANUAL_XML } });
  await watchOne(`https://youtu.be/${ID}`, options, fn);
  const post = calls.find((call) => call.url.includes('/youtubei/v1/player'));
  assert.equal(post.init.method, 'POST');
  assert.deepEqual(JSON.parse(post.init.body), { context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } }, videoId: ID });
  assert.match(post.init.headers['user-agent'], /^com\.google\.android\.youtube\//);
});

test('automatic captions are used when no manual track exists and the default audio language leads', async () => {
  const { options } = scratch();
  const english = track('en', 'asr');
  const dutch = track('nl', 'asr');
  const { fn } = fakeFetch({ player: playerOf({ tracks: [english, dutch], audio: 'nl.10' }), files: { [dutch.baseUrl]: ASR_XML, [english.baseUrl]: MANUAL_XML } });
  const result = await watchOne(ID, options, fn);
  assert.match(result.line, /captions=auto:nl /);
  assert.equal(readText(path.join(options.out, ID, 'transcript.txt')), '[00:00] hi everyone so heard of\n');
});

test('without an audio track id the automatic track names the spoken language, so its manual track beats English', async () => {
  const { options } = scratch();
  const english = track('en');
  const dutch = track('nl');
  const { fn } = fakeFetch({ player: playerOf({ tracks: [track('nl', 'asr'), english, dutch] }), files: { [dutch.baseUrl]: CLASSIC_XML, [english.baseUrl]: MANUAL_XML } });
  const result = await watchOne(ID, options, fn);
  assert.match(result.line, /captions=manual:nl /);
});

test('a long video with chapters gets chapter-cut chunk files and headings', async () => {
  const { options } = scratch();
  const manual = track('en');
  const cues = [[0, 'alpha'], [100, 'bravo'], [700, 'charlie'], [1000, 'delta'], [1400, 'echo'], [1900, 'foxtrot'], [2300, 'golf']];
  const xml = `<timedtext format="3"><body>${cues.map(([second, text]) => `<p t="${second * 1000}" d="2000">${text}</p>`).join('')}</body></timedtext>`;
  const page = pageOf([marker('Intro', 0), marker('Middle', 700), marker('End', 1400)]);
  const { fn } = fakeFetch({ player: playerOf({ tracks: [manual], length: '2400' }), page, files: { [manual.baseUrl]: xml } });
  const result = await watchOne(ID, { ...options, chunkMinutes: 10 }, fn);
  assert.match(result.line, /chunks=.*chunks \(4 files\)/);
  const chunk = (number) => readText(path.join(options.out, ID, 'chunks', `${number}.txt`));
  assert.match(chunk('01'), /^# Intro \[00:00\]-\[11:40\]\n\n## Intro\n\n\[00:00\] alpha\n\n\[01:40\] bravo\n$/);
  assert.match(chunk('02'), /^# Middle \[11:40\]-\[23:20\]\n\n## Middle\n\n\[11:40\] charlie\n\n\[16:40\] delta\n$/);
  assert.match(chunk('04'), /^# End \(part 2\/2\) \[31:40\]-\[40:00\]\n\n## End\n\n\[31:40\] foxtrot\n\n\[38:20\] golf\n$/);
  assert.match(readText(path.join(options.out, ID, 'transcript.txt')), /^## Intro\n\n\[00:00\]/);
});

test('a video over an hour carries hours in its stamps', async () => {
  const { options } = scratch();
  const manual = track('en');
  const xml = '<timedtext format="3"><body><p t="10000" d="1000">start</p><p t="3700000" d="1000">late</p></body></timedtext>';
  const { fn } = fakeFetch({ player: playerOf({ tracks: [manual], length: '4000' }), files: { [manual.baseUrl]: xml } });
  const result = await watchOne(ID, options, fn);
  assert.match(result.line, /duration=1:06:40 /);
  assert.match(readText(path.join(options.out, ID, 'transcript.txt')), /\[1:01:40\] late/);
});

test('a missing length falls back to the last cue', async () => {
  const { options } = scratch();
  const manual = track('en');
  const { fn } = fakeFetch({ player: playerOf({ tracks: [manual], length: '' }), files: { [manual.baseUrl]: MANUAL_XML } });
  assert.match((await watchOne(ID, options, fn)).line, /duration=0:01:30 /);
});

const NO_TRANSCRIPT = new RegExp(`^${ID}: no transcript: `);
const MISSING_TOOL = new RegExp(`^${ID}: missing tool: `);
const KEEP = async (input) => input;
const NO_NPM = async () => ({ error: new Error('offline'), stdout: '', stderr: 'npm ERR! offline\n' });
const NO_ENGINE = new RegExp(`^${ID}: no transcript: the video has no captions, and installing whisper\\.node failed: `);

async function withoutYtDlp(work) {
  const { dir, options } = scratch();
  const empty = path.join(dir, 'empty');
  fs.mkdirSync(empty);
  const saved = process.env.PATH;
  process.env.PATH = empty;
  try {
    return await work({ dir, options });
  } finally {
    process.env.PATH = saved;
  }
}

test('a video with no caption tracks and no tools reports a missing tool', async () => {
  await withoutYtDlp(async ({ options }) => {
    const result = await watchOne(ID, options, fakeFetch({ player: playerOf() }).fn);
    assert.match(result.failure, MISSING_TOOL);
    assert.match(result.failure, /no captions, and transcribing its audio needs yt-dlp on PATH/);
    assert.equal(result.line, undefined);
    assert.ok(!fs.existsSync(path.join(options.out, ID)));
  });
});

test('LOGIN_REQUIRED, an unavailable video, a 429 and an unreachable network report no transcript', async () => {
  await withoutYtDlp(async ({ options }) => {
    const bot = playerOf({ status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm you’re not a bot' });
    assert.match((await watchOne(ID, options, fakeFetch({ player: bot }).fn)).failure, /^abc12345678: no transcript: YouTube asks this network to sign in/);
    const gone = playerOf({ status: 'ERROR', reason: 'This video is unavailable' });
    assert.match((await watchOne(ID, options, fakeFetch({ player: gone }).fn)).failure, /no transcript: the video cannot be played \(ERROR: This video is unavailable\)/);
    assert.match((await watchOne(ID, options, fakeFetch({ playerStatus: 429 }).fn)).failure, /no transcript: YouTube answered 429/);
    const down = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
    assert.match((await watchOne(ID, options, down)).failure, /no transcript: .* did not answer: getaddrinfo ENOTFOUND/);
  });
});

function holdLoopUntilAbort(signal) {
  const keepAlive = setInterval(() => {}, 1000);
  signal.addEventListener('abort', () => clearInterval(keepAlive), { once: true });
}

test('a body that stalls past the wait reports no transcript instead of an abort error', async () => {
  await withoutYtDlp(async ({ options }) => {
    const stalling = async (url, init) => {
      holdLoopUntilAbort(init.signal);
      const body = new ReadableStream({ start(controller) { init.signal.addEventListener('abort', () => controller.error(init.signal.reason)); } });
      return new Response(body, { status: 200 });
    };
    const result = await watchOne(ID, { ...options, fetchMs: 100 }, stalling);
    assert.match(result.failure, NO_TRANSCRIPT);
    assert.match(result.failure, /did not answer/);
  });
});

test('an empty caption file, an exp=xpe track and a file with no text report no transcript', async () => {
  await withoutYtDlp(async ({ options }) => {
    const plain = track('en');
    const empty = fakeFetch({ player: playerOf({ tracks: [plain] }), files: { [plain.baseUrl]: '' } });
    assert.match((await watchOne(ID, options, empty.fn)).failure, /no transcript: YouTube sent an empty caption file/);
    const protectedTrack = track('en', undefined, '&exp=xpe');
    const xpe = fakeFetch({ player: playerOf({ tracks: [protectedTrack] }), files: { [protectedTrack.baseUrl]: MANUAL_XML } });
    assert.match((await watchOne(ID, options, xpe.fn)).failure, /no transcript: YouTube wants a proof-of-origin token/);
    assert.ok(!xpe.calls.some((call) => call.url.includes('exp=xpe')));
    const blank = fakeFetch({ player: playerOf({ tracks: [plain] }), files: { [plain.baseUrl]: '<timedtext format="3"><body></body></timedtext>' } });
    assert.match((await watchOne(ID, options, blank.fn)).failure, /no transcript: YouTube sent a caption file with no text/);
  });
});

test('a fetch that never answers is cut off after the wait and reports no transcript', async () => {
  await withoutYtDlp(async ({ options }) => {
    const waiting = (url, init) => new Promise((resolve, reject) => {
      holdLoopUntilAbort(init.signal);
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    });
    const result = await watchOne(ID, { ...options, fetchMs: 50 }, waiting);
    assert.match(result.failure, NO_TRANSCRIPT);
    assert.match(result.failure, /youtubei\/v1\/player did not answer: .*timeout/);
  });
});

const timedTextOf = (cues) => `<timedtext format="3"><body>${cues.map(([second, text]) => `<p t="${second * 1000}" d="2000">${text}</p>`).join('')}</body></timedtext>`;

test('a chunk holding several chapters names each of them', async () => {
  const { options } = scratch();
  const manual = track('en');
  const page = pageOf([marker('One', 0), marker('Two', 300), marker('Three', 700)]);
  const xml = timedTextOf([[10, 'one'], [400, 'two'], [900, 'three']]);
  const { fn } = fakeFetch({ player: playerOf({ tracks: [manual], length: '2400' }), page, files: { [manual.baseUrl]: xml } });
  await watchOne('multi123456', { ...options, chunkMinutes: 10 }, fn);
  const first = readText(path.join(options.out, 'multi123456', 'chunks', '01.txt'));
  assert.match(first, /^# One to Two /);
  assert.match(first, /## One\n\n\[00:10\] one\n\n## Two\n\n\[06:40\] two\n$/);
});

test('a first chapter after zero does not drop the cues before it', async () => {
  const { options } = scratch();
  const manual = track('en');
  const xml = timedTextOf([[5, 'early'], [800, 'later']]);
  const { fn } = fakeFetch({ player: playerOf({ tracks: [manual], length: '1500' }), page: pageOf([marker('Late', 15)]), files: { [manual.baseUrl]: xml } });
  await watchOne('late1234567', { ...options, chunkMinutes: 10 }, fn);
  const folder = path.join(options.out, 'late1234567', 'chunks');
  const all = fs.readdirSync(folder).map((name) => readText(path.join(folder, name))).join('');
  assert.match(all, /early/);
});

test('without a length the stamps carry hours past one hour', async () => {
  const { options } = scratch();
  const manual = track('en');
  const { fn } = fakeFetch({ player: playerOf({ tracks: [manual], length: '' }), files: { [manual.baseUrl]: timedTextOf([[10, 'start'], [3700, 'late']]) } });
  const result = await watchOne('nodur123456', options, fn);
  assert.match(result.line, /duration=1:01:40 /);
  assert.match(readText(path.join(options.out, 'nodur123456', 'transcript.txt')), /\[1:01:40\] late/);
});

test('a video that throws fails alone and does not hide the others', async () => {
  const { options } = scratch();
  const manual = track('en');
  const good = fakeFetch({ player: playerOf({ tracks: [manual] }), files: { [manual.baseUrl]: MANUAL_XML } });
  const broken = async (url, init) => (String(init.body ?? '').includes(OTHER_ID) ? null : good.fn(url, init));
  const results = [await watchGuarded(ID, options, broken), await watchGuarded(OTHER_ID, options, broken)];
  assert.match(results[0].line, new RegExp(`^id=${ID} `));
  assert.match(results[1].failure, new RegExp(`^${OTHER_ID}: `));
});

test('a language with no track lists the languages that exist', async () => {
  const { options } = scratch();
  const { fn } = fakeFetch({ player: playerOf({ tracks: [track('en'), track('fr', 'asr')] }) });
  const result = await watchOne(ID, { ...options, lang: 'de' }, fn);
  assert.match(result.failure, /no captions in language 'de'; available: en, fr\. Rerun with --lang/);
});

test('a chapterless page or a failing watch page still gives the transcript', async () => {
  const { options } = scratch();
  const manual = track('en');
  const base = fakeFetch({ player: playerOf({ tracks: [manual] }), files: { [manual.baseUrl]: MANUAL_XML } });
  const failing = async (url, init) => (String(url).includes('/watch?v=') ? new Response('', { status: 500 }) : base.fn(url, init));
  const result = await watchOne(ID, options, failing);
  assert.equal(result.failure, undefined);
  assert.equal(readText(path.join(options.out, ID, 'transcript.txt')), XML_TEXT);
});

const FAKE_YT_DLP = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + '\\n');
if (args.includes('--version')) { console.log('2025.01.01'); process.exit(0); }
const info = JSON.parse(fs.readFileSync(process.env.FAKE_INFO, 'utf8'));
if (info.old && args.includes('--js-runtimes')) { console.error('yt-dlp: error: no such option: --js-runtimes'); process.exit(2); }
if (info.hang && args.includes('-J')) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
if (args.includes('-J')) { console.log(JSON.stringify(info)); process.exit(0); }
const lang = args[args.indexOf('--sub-langs') + 1];
const template = args[args.indexOf('-o') + 1];
fs.writeFileSync(path.join(args[args.indexOf('-P') + 1], template.replace('%(id)s', info.id).replace('%(ext)s', lang + '.vtt')), fs.readFileSync(process.env.FAKE_VTT, 'utf8'));
`;

function withFakeYtDlp(info, work) {
  const { dir, options } = scratch();
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'yt-dlp'), FAKE_YT_DLP, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify(info));
  fs.writeFileSync(path.join(dir, 'in.vtt'), MANUAL_VTT);
  const saved = { ...process.env };
  Object.assign(process.env, { PATH: bin, FAKE_LOG: path.join(dir, 'calls.log'), FAKE_INFO: path.join(dir, 'info.json'), FAKE_VTT: path.join(dir, 'in.vtt') });
  const restore = () => { for (const key of ['PATH', 'FAKE_LOG', 'FAKE_INFO', 'FAKE_VTT']) process.env[key] = saved[key]; };
  return work({ dir, options }).finally(restore);
}

const callLog = (dir) => (fs.existsSync(path.join(dir, 'calls.log')) ? readText(path.join(dir, 'calls.log')).split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []);
const YT_INFO = { id: OTHER_ID, title: 'Via yt-dlp', duration: 120, language: 'en', subtitles: { en: TRACK }, automatic_captions: {} };

test('yt-dlp reads the captions when the fetch is refused and yt-dlp is on PATH', async () => {
  await withFakeYtDlp(YT_INFO, async ({ dir, options }) => {
    const bot = playerOf({ status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm you’re not a bot' });
    const result = await watchOne(OTHER_ID, options, fakeFetch({ player: bot }).fn);
    assert.equal(result.failure, undefined);
    assert.match(result.line, new RegExp(`^id=${OTHER_ID} title="Via yt-dlp" duration=0:02:00 captions=manual:en words=12`));
    assert.equal(readText(path.join(options.out, OTHER_ID, 'transcript.txt')), MANUAL_TEXT);
    const fetchCall = callLog(dir).find((args) => args.includes('--skip-download'));
    assert.ok(fetchCall.includes('--write-subs'));
    assert.equal(fetchCall[fetchCall.indexOf('--playlist-items') + 1], '1');
    assert.deepEqual(fetchCall.slice(-2), ['--', `https://www.youtube.com/watch?v=${OTHER_ID}`]);
  });
});

test('an older yt-dlp that does not know --js-runtimes is retried once without it', async () => {
  await withFakeYtDlp({ ...YT_INFO, old: true }, async ({ dir, options }) => {
    const bot = playerOf({ status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm you’re not a bot' });
    const result = await watchOne(OTHER_ID, options, fakeFetch({ player: bot }).fn);
    assert.equal(result.failure, undefined);
    assert.match(result.line, /captions=manual:en /);
    const calls = callLog(dir).filter((args) => !args.includes('--version') && !args.includes('bv*/b'));
    assert.deepEqual(calls.map((args) => args.includes('--js-runtimes')), [true, false, true, false]);
  });
});

test('the yt-dlp metadata call asks for subtitle tracks, because TikTok lists none without a subtitle flag', async () => {
  await withFakeYtDlp(YT_INFO, async ({ dir, options }) => {
    const unplayable = playerOf({ status: 'UNPLAYABLE', reason: 'This video is not available on this client' });
    await watchOne(OTHER_ID, options, fakeFetch({ player: unplayable }).fn);
    const metadata = callLog(dir).find((args) => args.includes('-J'));
    assert.ok(metadata.includes('--write-subs'));
    assert.ok(metadata.includes('--write-auto-subs'));
  });
});

test('an UNPLAYABLE answer to the ANDROID client falls back to yt-dlp, and without yt-dlp reports no transcript', async () => {
  const unplayable = playerOf({ status: 'UNPLAYABLE', reason: 'This video is not available on this client' });
  await withFakeYtDlp(YT_INFO, async ({ dir, options }) => {
    const result = await watchOne(OTHER_ID, options, fakeFetch({ player: unplayable }).fn);
    assert.equal(result.failure, undefined);
    assert.match(result.line, /captions=manual:en /);
    assert.ok(callLog(dir).some((args) => args.includes('-J')));
  });
  await withoutYtDlp(async ({ options }) => {
    const result = await watchOne(ID, options, fakeFetch({ player: unplayable }).fn);
    assert.match(result.failure, /^abc12345678: no transcript: the video cannot be played \(UNPLAYABLE: /);
  });
});

test('yt-dlp is called only for the audio when the video has no captions', async () => {
  await withFakeYtDlp(YT_INFO, async ({ dir, options }) => {
    const manual = track('en');
    const worked = fakeFetch({ player: playerOf({ tracks: [manual] }), files: { [manual.baseUrl]: MANUAL_XML } });
    assert.equal((await watchOne(ID, options, worked.fn)).failure, undefined);
    assert.match((await watchOne(ID, { ...options, runTool: NO_NPM, toWav: KEEP }, fakeFetch({ player: playerOf() }).fn)).failure, NO_ENGINE);
    const gone = playerOf({ status: 'ERROR', reason: 'This video is unavailable' });
    assert.match((await watchOne(ID, options, fakeFetch({ player: gone }).fn)).failure, NO_TRANSCRIPT);
    const calls = callLog(dir).filter((args) => !args.includes('bv*/b'));
    assert.equal(calls.length, 1);
    assert.ok(calls[0].includes('-f'));
  });
});

test('a refused fetch with no yt-dlp on PATH reports no transcript and installs nothing', async () => {
  await withoutYtDlp(async ({ options }) => {
    const bot = playerOf({ status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm you’re not a bot' });
    const result = await watchOne(ID, options, fakeFetch({ player: bot }).fn);
    assert.match(result.failure, NO_TRANSCRIPT);
    assert.doesNotMatch(result.failure, /install|brew|pip/i);
  });
});

test('yt-dlp failing too reports both reasons', async () => {
  await withFakeYtDlp({ ...YT_INFO, subtitles: {}, automatic_captions: {} }, async ({ options }) => {
    const bot = playerOf({ status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm you’re not a bot' });
    const result = await watchOne(OTHER_ID, { ...options, runTool: NO_NPM, toWav: KEEP }, fakeFetch({ player: bot }).fn);
    assert.match(result.failure, /^xyz98765432: no transcript: YouTube asks this network to sign in.*; the video has no captions, and installing whisper\.node failed: /s);
  });
});

test('a yt-dlp that outlasts its wait is stopped and reported as no transcript', async () => {
  await withFakeYtDlp({ ...YT_INFO, hang: true }, async ({ options }) => {
    const bot = playerOf({ status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm you’re not a bot' });
    const result = await watchOne(OTHER_ID, { ...options, ytDlpMs: 300 }, fakeFetch({ player: bot }).fn);
    assert.match(result.failure, /^xyz98765432: no transcript: YouTube asks this network to sign in.*; yt-dlp failed too: did not finish within 0\.3 s$/s);
  });
});

function run(args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

test('a bad url exits 1 with a line on stderr and prints nothing on stdout', () => {
  const result = run(['--url', `${ID}";touch pwned;"`]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /not a video url or an 11-character YouTube id/);
});

test('usage errors exit 2 and --help exits 0 without naming an install line', () => {
  assert.equal(run([]).status, 2);
  assert.equal(run(['--chunk-minutes', '0', '--url', ID]).status, 2);
  assert.equal(run(['--vtt', 'x.vtt']).status, 2);
  const help = run(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /usage: node transcript\.mjs/);
  assert.doesNotMatch(help.stdout, /brew|pip install|parakeet/);
});

test('a non-YouTube url goes to yt-dlp and lands in an extractor-id folder', async () => {
  const info = { ...YT_INFO, id: 'a.b', extractor_key: 'TikTok' };
  await withFakeYtDlp(info, async ({ options }) => {
    const result = await watchOne('https://clips.example.com/v/1', options, async () => { throw new Error('network'); });
    assert.equal(result.failure, undefined);
    assert.match(result.line, /^id=tiktok-a-b /);
    assert.equal(readText(path.join(options.out, 'tiktok-a-b', 'transcript.txt')), MANUAL_TEXT);
  });
});

test('ids that differ only in case land in separate folders on disk', async () => {
  await withFakeYtDlp({ ...YT_INFO, id: 'AbC', extractor_key: 'Instagram' }, async ({ dir, options }) => {
    const url = 'https://www.instagram.com/reel/AbC/';
    await watchOne(url, options, async () => { throw new Error('network'); });
    fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify({ ...YT_INFO, id: 'abc', extractor_key: 'Instagram' }));
    await watchOne(url, options, async () => { throw new Error('network'); });
    const folders = fs.readdirSync(options.out);
    assert.equal(folders.length, 2);
    assert.ok(folders.includes('instagram-abc'));
  });
});

test('a non-YouTube url without yt-dlp on PATH names the install line', async () => {
  const { options } = scratch();
  const saved = process.env.PATH;
  process.env.PATH = '';
  const result = await watchOne('https://clips.example.com/v/1', options).finally(() => { process.env.PATH = saved; });
  assert.match(result.failure, /: missing tool: reading clips\.example\.com videos needs yt-dlp on PATH; install it with 'brew install yt-dlp' or 'pipx install yt-dlp', then rerun$/);
});

function sequencedFetch(answers, files = {}) {
  const clients = [];
  const inner = fakeFetch({ files }).fn;
  const fn = async (url, init = {}) => {
    if (!String(url).includes('/youtubei/v1/player')) return inner(url, init);
    clients.push(JSON.parse(init.body).context.client.clientName);
    const answer = answers[Math.min(clients.length, answers.length) - 1];
    return new Response(JSON.stringify(answer.player ?? {}), { status: answer.status ?? 200 });
  };
  return { fn, clients };
}

const BOT = playerOf({ status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm you’re not a bot' });

test('a bot check or a 429 is retried once with a second client identity and then read', async () => {
  for (const first of [{ player: BOT }, { status: 429 }]) {
    await withoutYtDlp(async ({ options }) => {
      const manual = track('en');
      const { fn, clients } = sequencedFetch([first, { player: playerOf({ tracks: [manual] }) }], { [manual.baseUrl]: MANUAL_XML });
      assert.equal((await watchOne(ID, options, fn)).failure, undefined);
      assert.equal(clients.length, 2);
      assert.notEqual(clients[0], clients[1]);
    });
  }
});

test('a block that survives the retry records a gap after exactly two requests', async () => {
  await withoutYtDlp(async ({ options }) => {
    const { fn, clients } = sequencedFetch([{ player: BOT }]);
    const result = await watchOne(ID, options, fn);
    assert.match(result.failure, /^abc12345678: no transcript: YouTube asks this network to sign in/);
    assert.equal(clients.length, 2);
  });
});

test('an unavailable video is not retried', async () => {
  await withoutYtDlp(async ({ options }) => {
    const { fn, clients } = sequencedFetch([{ player: playerOf({ status: 'ERROR', reason: 'This video is unavailable' }) }]);
    await watchOne(ID, options, fn);
    assert.equal(clients.length, 1);
  });
});
