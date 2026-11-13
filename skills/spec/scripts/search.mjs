import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { limitLifetime, SPEC_SEARCH_LIFETIME_MS } from '#lifetime';
import { excludeScratchIfGit, recordSource } from './ledger.mjs';
import { BlockedRoute } from './sources/http.mjs';
import { SOURCES } from './sources/index.mjs';
import { loginBrowser } from './sources/reddit-browser.mjs';

const DEFAULT_LIMIT = 5;

export async function searchSource(request, context) {
  const { source, query, limit = DEFAULT_LIMIT, runDir, subreddit, sort, time, urls } = request;
  const adapter = SOURCES[source];
  if (!adapter) throw new Error(`unknown source ${source}; use ${Object.keys(SOURCES).join(', ')}`);
  const hits = await adapter({ query, limit, subreddit, sort, time, urls }, { stateDir: runDir, ...context });
  return hits.map((hit) => {
    const { title, date, signals, description } = hit;
    const row = recordSource(runDir, { url: hit.url, fields: { source, title, date, signals, description } });
    return { ...row, comments: hit.comments, blocked: hit.blocked };
  });
}

export function appendMetric(runDir, metric) {
  fs.mkdirSync(runDir, { recursive: true });
  fs.appendFileSync(path.join(runDir, 'metrics.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...metric })}\n`);
}

async function timedSearch(request, context) {
  const started = Date.now();
  const metric = { tool: 'search', source: request.source };
  try {
    const rows = await searchSource(request, context);
    appendMetric(request.runDir, { ...metric, ms: Date.now() - started, ok: true, rows: rows.length });
    return rows;
  } catch (error) {
    appendMetric(request.runDir, { ...metric, ms: Date.now() - started, ok: false, error: error.message });
    throw error;
  }
}

function failureLine(source, error) {
  const kind = error instanceof BlockedRoute ? 'blocked' : 'failed';
  return `status: ${kind} ${source} ${error.message}`;
}

export async function searchMany(request, context) {
  const { sources, ...rest } = request;
  const settled = await Promise.allSettled(sources.map((source) => timedSearch({ ...rest, source }, context)));
  const lines = [];
  settled.forEach((outcome, index) => {
    if (outcome.status === 'rejected') {
      lines.push(failureLine(sources[index], outcome.reason));
      return;
    }
    for (const row of outcome.value) {
      const { ref, title, url, date, signals, description, comments, blocked } = row;
      lines.push(JSON.stringify({ ref, title, url, date, signals, description, comments, blocked }));
    }
  });
  return { lines, failed: settled.every((outcome) => outcome.status === 'rejected') };
}

const SINGLE_FLAGS = ['source', 'query', 'run', 'limit', 'subreddit', 'sort', 'time'];

export function parseArgs(argv) {
  const values = {};
  let owner = null;
  for (const token of argv) {
    if (token === '--login') {
      values.login = true;
      owner = null;
      continue;
    }
    if (token.startsWith('--')) {
      owner = token.slice(2);
      if (owner !== 'url' && !SINGLE_FLAGS.includes(owner)) throw new Error(`unknown flag ${token}`);
      continue;
    }
    if (owner === 'url') {
      (values.urls ??= []).push(token);
      continue;
    }
    if (!owner || values[owner] !== undefined) throw new Error(`value ${token} belongs to no flag`);
    values[owner] = token;
  }
  return values;
}

export async function loginReddit(open = loginBrowser) {
  try {
    await open();
    return null;
  } catch (error) {
    if (!(error instanceof BlockedRoute)) throw error;
    return failureLine('reddit', error);
  }
}

async function main(argv) {
  limitLifetime('spec-search', SPEC_SEARCH_LIFETIME_MS);
  excludeScratchIfGit(process.cwd());
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  if (args.login) {
    if (args.source !== 'reddit') {
      process.stderr.write('usage: search.mjs --source reddit --login\n');
      process.exitCode = 2;
      return;
    }
    const line = await loginReddit();
    if (line) process.stdout.write(`${line}\n`);
    if (line) process.exitCode = 1;
    return;
  }
  const hasInput = args.query || args.urls;
  if (!args.source || !hasInput || !args.run) {
    process.stderr.write('usage: search.mjs --source <name>[,<name>...] (--query <text> | --url <thread url>...) --run <dir> [--limit <n>] [--subreddit <name>] [--sort <order>] [--time <window>]\n');
    process.exitCode = 2;
    return;
  }
  const request = { sources: args.source.split(','), query: args.query ?? '', limit: Number(args.limit ?? DEFAULT_LIMIT), runDir: args.run, subreddit: args.subreddit, sort: args.sort, time: args.time, urls: args.urls };
  const { lines, failed } = await searchMany(request, {});
  for (const line of lines) process.stdout.write(`${line}\n`);
  if (failed) process.exitCode = 1;
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file:').href) await main(process.argv.slice(2));
