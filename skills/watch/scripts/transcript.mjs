#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { sleep, parseLine } from '#basics';
import { limitLifetime } from '#lifetime';
import { UsageError, POSITIVE_INTEGER, environmentMs, environmentDelayMs, parseFlags, isMain } from '#script-flags';
import { classifyOutsideFailure } from '../../../lib/outside-limit.mjs';
import { sourceOf } from './video-url.mjs';
import { DEFAULTS } from './defaults.mjs';
import { prefetchTikTok } from './tiktok.mjs';
import { watchGuarded } from './watch.mjs';
import { writeMerged } from './outputs.mjs';
import { RATE_LIMITED_EXIT } from './request-gate.mjs';

const SPEC = { url: 'list', from: 'list', force: 'boolean', lang: 'string', model: 'string', out: 'string', 'chunk-minutes': 'string', 'stamp-seconds': 'string', help: 'boolean' };
const USAGE = [
  'usage: node transcript.mjs (--url <url-or-id> [--url <url-or-id> ...] | --from <file-or-->) [--force] [--lang <code>] [--model <name-or-path>] [--out <dir>] [--chunk-minutes <n>] [--stamp-seconds <n>]',
  'Fetches the captions of each YouTube video, or of a TikTok, Instagram, Facebook, X or other video url through yt-dlp, with Node alone for YouTube and writes <out>/<id>/raw.xml and transcript.txt; a video longer than twice the chunk window also gets chunks/NN.txt.',
  'When YouTube refuses the request, and for any other site, yt-dlp reads the captions instead (raw.vtt). A yt-dlp on PATH is used; with none, the official release binary is fetched from GitHub, checked against its SHA2-256SUMS and cached under $CLAUDE_PLUGIN_DATA/bin (else ~/.cache/exo/bin); EXO_YTDLP names a binary to use instead.',
  'A video with no captions, or whose captions yt-dlp cannot fetch because of a rate limit, is transcribed locally from its audio: yt-dlp downloads it (mp3, wav or flac as is, any other format through the bundled decoder) and the first engine found wins: whisper-cli, then whisper, else whisper.node, which is fetched on first use into $CLAUDE_PLUGIN_DATA/npm/whisper (else ~/.cache/exo/npm/whisper) together with the pinned ggml-base-q5_1 model (60 MB, checked against its SHA-256 and cached under models/). --model names an existing ggml file for whisper-cli or a model name for whisper; --lang names the spoken language, else it is detected. A video without speech gets the one-line transcript `no speech in this video`. EXO_WATCH_TRANSCRIBE_MS sets the wait for the engine (default 1800000).',
  'A batch runs the videos one by one, never in parallel: repeat --url, and/or give --from a file with one url per line (blank lines and anything after the first whitespace are ignored, so the output of list.mjs works as is), or --from - to read the urls from stdin. A video already finished under <out> is skipped with a `skipped` line unless --force; only a run that finished marks a video done (<out>/done.jsonl), so a crashed one is redone. A batch of two or more videos ends with one line: `batch done=<n> skipped=<n> failed=<n>`, then ` | <failure> (<id>, <id>)` for each distinct failure.',
  'Prints one line per video: id, title, duration, caption source, words, token estimate, paths. The transcript itself is never printed.',
  'Defaults: --out .exo/watch, --chunk-minutes 30, --stamp-seconds 45, --lang the language of the video\'s default audio (manual captions first, else automatic). EXO_WATCH_FETCH_MS sets the wait per request (default 30000); EXO_WATCH_YTDLP_MS sets the wait per yt-dlp call (default 120000).',
  'Exit codes: 75 a rate limit (HTTP 429) stopped the batch and the wait of EXO_WATCH_RATE_WAIT_MS ran out: the last line gives the open videos and the restart command; 0 at least one video done or skipped; 1 every video failed (a video has no transcript (the message says why), a tool is missing or yt-dlp could not be fetched (`missing tool`, with its install command) or its language is missing); a failed video does not stop the batch and its message goes to stderr; 2 bad usage or an unreadable --from file.',
].join('\n');

export function readOptions(flags, listed = []) {
  const urls = [...(flags.url ?? []), ...listed];
  if (urls.length === 0) throw new UsageError('give at least one --url <url-or-id> or --from <file>');
  for (const name of ['chunk-minutes', 'stamp-seconds']) {
    if (flags[name] !== undefined && !POSITIVE_INTEGER.test(flags[name])) throw new UsageError(`--${name} needs a positive integer, got '${flags[name]}'`);
  }
  return {
    urls,
    force: flags.force === true,
    lang: flags.lang,
    model: flags.model,
    out: path.resolve(flags.out ?? DEFAULTS.out),
    chunkMinutes: Number(flags['chunk-minutes'] ?? DEFAULTS.chunkMinutes),
    stampSeconds: Number(flags['stamp-seconds'] ?? DEFAULTS.stampSeconds),
    fetchMs: environmentMs('EXO_WATCH_FETCH_MS', DEFAULTS.fetchMs),
    ytDlpMs: environmentMs('EXO_WATCH_YTDLP_MS', DEFAULTS.ytDlpMs),
    transcribeMs: environmentMs('EXO_WATCH_TRANSCRIBE_MS', DEFAULTS.transcribeMs),
    rateWaitMs: environmentDelayMs('EXO_WATCH_RATE_WAIT_MS', DEFAULTS.rateWaitMs),
    backoffMs: environmentDelayMs('EXO_WATCH_BACKOFF_MS', DEFAULTS.retryBackoffMs),
  };
}

const LIST_SUMMARY = /^\d+ entr(y|ies)(\s|$)/;
const STDIN = '-';

function parseUrlLines(text) {
  return text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !LIST_SUMMARY.test(line))
    .map((line) => line.split(/\s/)[0]);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function readSource(source) {
  if (source === STDIN) return readStdin();
  try {
    return fs.readFileSync(source, 'utf8');
  } catch (error) {
    throw new UsageError(`cannot read --from ${source}: ${error.code ?? error.message}`);
  }
}

async function readListed(sources) {
  const urls = [];
  for (const source of sources) {
    const found = parseUrlLines(await readSource(source));
    if (found.length === 0) throw new UsageError(`--from ${source} holds no url`);
    urls.push(...found);
  }
  return urls;
}

const LEDGER = 'done.jsonl';

function entriesOf(out) {
  const file = path.join(out, LEDGER);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').map(parseLine).filter((entry) => entry !== null);
}

function findDone(out, key) {
  const entry = entriesOf(out).findLast((candidate) => candidate.key === key);
  if (!entry || !fs.existsSync(path.join(out, entry.transcript))) return null;
  return entry;
}

function markDone(out, key, { line, transcript, route, timings }) {
  fs.mkdirSync(out, { recursive: true });
  const entry = { key, transcript: path.relative(out, transcript), line, route, timings };
  fs.appendFileSync(path.join(out, LEDGER), `${JSON.stringify(entry)}\n`);
}

function keyOf(input) {
  const source = sourceOf(input);
  return source?.id ?? source?.url ?? null;
}

function doneOf(input, options) {
  const key = keyOf(input);
  return key && !options.force ? findDone(options.out, key) : null;
}

async function runOne(input, options, fetchFn) {
  const key = keyOf(input);
  const done = doneOf(input, options);
  if (done) return { status: 'skipped', line: `skipped ${done.line}` };
  const result = await watchGuarded(input, options, fetchFn);
  if (result.failure) return { status: 'failed', failure: result.failure };
  if (key && result.transcript) markDone(options.out, key, result);
  return { status: 'done', line: result.line };
}

function note(message) {
  console.error(`batch: ${message}`);
}

async function probeUntilOpen(input, options, fetchFn) {
  let backoffMs = Math.max(options.backoffMs, 1);
  let waitedMs = 0;
  let probe = 0;
  while (waitedMs < options.rateWaitMs) {
    probe += 1;
    note(`probe ${probe}, waited ${waitedMs} of ${options.rateWaitMs} ms`);
    const waitMs = Math.min(backoffMs, options.rateWaitMs - waitedMs);
    await sleep(waitMs);
    waitedMs += waitMs;
    backoffMs *= 2;
    const outcome = await runOne(input, options, fetchFn);
    if (!isRateLimited(outcome)) {
      note('resumed');
      return outcome;
    }
  }
  return null;
}

function isRateLimited(outcome) {
  return Boolean(outcome.failure) && classifyOutsideFailure({ text: outcome.failure }) === 'rate-limited';
}

async function tripAndProbe(input, options, fetchFn) {
  note(`rate-limited on ${input}, no further video starts`);
  return probeUntilOpen(input, options, fetchFn);
}

function isChunked(out, done) {
  return fs.existsSync(path.join(out, path.dirname(done.transcript), 'chunks'));
}

function mergeFinished(options) {
  const entries = options.urls.flatMap((input) => {
    const key = keyOf(input);
    const done = key ? findDone(options.out, key) : null;
    if (!done || isChunked(options.out, done)) return [];
    return [{ id: path.dirname(done.transcript), transcript: done.transcript }];
  });
  if (entries.length < 2) return;
  note(`merged transcripts ${writeMerged(options.out, entries)}`);
}

export async function watchBatch(batchOptions, report, fetchFn = globalThis.fetch) {
  const parallel = environmentMs('EXO_WATCH_PAGE_PARALLEL', DEFAULTS.pageParallel);
  const cutoff = new AbortController();
  const unread = batchOptions.urls.filter((input) => !doneOf(input, batchOptions));
  const options = { ...batchOptions, pageReads: prefetchTikTok(unread, { ...batchOptions, parallel, signal: cutoff.signal }, fetchFn) };
  const outcomes = [];
  const guarded = options.urls.length > 1;
  for (const [index, input] of options.urls.entries()) {
    let outcome = await runOne(input, options, fetchFn);
    if (guarded && isRateLimited(outcome)) {
      cutoff.abort();
      outcome = await tripAndProbe(input, options, fetchFn);
    }
    if (!outcome) {
      const open = options.urls.slice(index);
      const restart = options.restart(open);
      outcomes.push(...open.map(() => ({ status: 'open', restart })));
      mergeFinished(options);
      return outcomes;
    }
    outcomes.push(outcome);
    report(outcome);
  }
  mergeFinished(options);
  return outcomes;
}

function splitFailure(failure) {
  const at = failure.indexOf(': ');
  return at < 0 ? { id: failure, reason: failure } : { id: failure.slice(0, at), reason: failure.slice(at + 2) };
}

function failureGroups(outcomes) {
  const groups = new Map();
  for (const { failure } of outcomes.filter((outcome) => outcome.failure)) {
    const { id, reason } = splitFailure(failure);
    groups.set(reason, [...(groups.get(reason) ?? []), id]);
  }
  return [...groups].map(([reason, ids]) => `${reason} (${ids.join(', ')})`);
}

function summaryLine(outcomes) {
  const count = (status) => outcomes.filter((outcome) => outcome.status === status).length;
  const counts = `batch done=${count('done')} skipped=${count('skipped')} failed=${count('failed')}`;
  if (count('open') === 0) return [counts, ...failureGroups(outcomes)].join(' | ');
  return [`${counts} open=${count('open')}`, ...failureGroups(outcomes), 'rate-limited', `restart: ${outcomes.find((outcome) => outcome.restart).restart}`].join(' | ');
}

function exitCodeOf(outcomes) {
  if (outcomes.some((outcome) => outcome.status === 'open')) return RATE_LIMITED_EXIT;
  return outcomes.every((outcome) => outcome.status === 'failed') ? 1 : 0;
}

function report(outcome) {
  if (outcome.line) console.log(outcome.line);
  if (outcome.failure) console.error(outcome.failure);
}

function quoted(word) {
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`;
}

function withoutInputs(args) {
  return args.filter((arg, index) => !['--url', '--from'].includes(arg) && !['--url', '--from'].includes(args[index - 1]));
}

function restartFor(args, fromStdin) {
  return (open) => {
    const words = fromStdin ? [...withoutInputs(args), ...open.flatMap((url) => ['--url', url])] : args;
    return ['node', ...words].map(quoted).join(' ');
  };
}

async function main(argv) {
  const flags = parseFlags(argv, SPEC, { usage: USAGE });
  const options = readOptions(flags, await readListed(flags.from ?? []));
  limitLifetime('watch-transcript', 1800000 + options.rateWaitMs);
  const restart = restartFor(process.argv.slice(1), (flags.from ?? []).includes('-'));
  const outcomes = await watchBatch({ ...options, restart }, report);
  const exitCode = exitCodeOf(outcomes);
  if (outcomes.length > 1 || exitCode === RATE_LIMITED_EXIT) console.log(summaryLine(outcomes));
  return exitCode;
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (error) => {
      console.error(error.message);
      process.exitCode = error instanceof UsageError ? 2 : 1;
    },
  );
}
