#!/usr/bin/env node

import process from 'node:process';
import { limitLifetime } from '#lifetime';
import { UsageError, POSITIVE_INTEGER, environmentMs, parseFlags, isMain } from '#script-flags';
import { DEFAULTS } from './defaults.mjs';
import { formatDuration } from './format.mjs';
import { classifyOutsideFailure } from '../../../lib/outside-limit.mjs';
import { RATE_LIMITED_EXIT, gateRequest } from './request-gate.mjs';
import { WATCH_URL } from './video-url.mjs';
import { isFetchFailure } from './run-tool.mjs';

const SEARCH_URL = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false';
const WEB_CLIENT = { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'en' };
const SEARCH_LIMIT = 10;

const SPEC = { query: 'string', limit: 'string', help: 'boolean' };
const USAGE = [
  'usage: node search.mjs --query <text> [--limit <n>]',
  'Searches YouTube through its keyless InnerTube search: nothing is downloaded or written to disk.',
  'Prints one line per video: id, url, title, channel, duration, and views and upload date when YouTube sends them.',
  'Defaults: --limit 10. EXO_WATCH_FETCH_MS sets the wait for the request (default 30000).',
  'Exit codes: 0 listed; 75 YouTube answered 429; 1 YouTube refused, answered badly or found nothing; 2 bad usage.',
].join('\n');

function readOptions(flags) {
  if (flags.query === undefined || flags.query.trim() === '') throw new UsageError('give a --query <text>');
  if (flags.limit !== undefined && !POSITIVE_INTEGER.test(flags.limit)) throw new UsageError(`--limit needs a positive integer, got '${flags.limit}'`);
  return {
    query: flags.query.trim(),
    limit: flags.limit === undefined ? SEARCH_LIMIT : Number(flags.limit),
    fetchMs: environmentMs('EXO_WATCH_FETCH_MS', DEFAULTS.fetchMs),
  };
}

function requestBody({ query }) {
  return JSON.stringify({ context: { client: WEB_CLIENT }, query });
}

function videosOf(answer) {
  const sections = answer?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ?? [];
  return sections
    .flatMap((section) => section.itemSectionRenderer?.contents ?? [])
    .map((item) => item.videoRenderer)
    .filter(Boolean);
}

function textOf(field) {
  return field?.simpleText ?? field?.runs?.map((run) => run.text).join('') ?? '';
}

function durationOf(renderer) {
  const parts = textOf(renderer.lengthText).split(':').map(Number);
  if (parts.length === 0 || parts.some(Number.isNaN)) return '';
  return formatDuration(parts.reduce((total, part) => total * 60 + part, 0));
}

function rowLine(renderer) {
  const fields = [renderer.videoId, `${WATCH_URL}${renderer.videoId}`, textOf(renderer.title), textOf(renderer.ownerText), durationOf(renderer), textOf(renderer.viewCountText), textOf(renderer.publishedTimeText)];
  return fields.filter(Boolean).join(' | ');
}

function fetchFailure(error) {
  if (!isFetchFailure(error)) throw error;
  return { failed: error };
}

async function listVideos(response, options) {
  let answer;
  try {
    answer = await response.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { failure: 'search failed: YouTube answered with data that is not JSON' };
  }
  const renderers = videosOf(answer).slice(0, options.limit);
  if (renderers.length === 0) return { failure: `no videos: YouTube found none for '${options.query}'` };
  return { lines: renderers.map(rowLine) };
}

async function searchVideos(options) {
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: requestBody(options),
    signal: AbortSignal.timeout(options.fetchMs),
  };
  await gateRequest(SEARCH_URL);
  const response = await fetch(SEARCH_URL, init).catch(fetchFailure);
  if (response.failed) return { failure: `search failed: ${response.failed.message}` };
  if (classifyOutsideFailure({ status: response.status }) === 'rate-limited') return { failure: 'search failed: YouTube answered 429, this network is rate limited', rateLimited: true };
  if (!response.ok) return { failure: `search failed: YouTube answered HTTP ${response.status}`, rateLimited: false };
  return listVideos(response, options);
}

async function main(argv) {
  limitLifetime('watch-search', 1800000);
  const options = readOptions(parseFlags(argv, SPEC, { usage: USAGE }));
  const result = await searchVideos(options);
  if (result.failure) {
    console.error(result.failure);
    return result.rateLimited ? RATE_LIMITED_EXIT : 1;
  }
  console.log(result.lines.join('\n'));
  return 0;
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
