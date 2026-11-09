import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { excludeScratchIfGit, recordSource } from './ledger.mjs';
import { BlockedRoute } from './sources/http.mjs';
import { SOURCES } from './sources/index.mjs';

const DEFAULT_LIMIT = 5;

export async function searchSource(request, context) {
  const { source, query, limit = DEFAULT_LIMIT, runDir, subreddit, urls } = request;
  const adapter = SOURCES[source];
  if (!adapter) throw new Error(`unknown source ${source}; use ${Object.keys(SOURCES).join(', ')}`);
  const hits = await adapter({ query, limit, subreddit, urls }, { stateDir: runDir, ...context });
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

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index].replace(/^--/, '');
    if (name === 'url') {
      (values.urls ??= []).push(argv[index + 1]);
      continue;
    }
    values[name] = argv[index + 1];
  }
  return values;
}

async function main(argv) {
  excludeScratchIfGit(process.cwd());
  const args = parseArgs(argv);
  const hasInput = args.query || args.urls;
  if (!args.source || !hasInput || !args.run) {
    process.stderr.write('usage: search.mjs --source <name>[,<name>...] (--query <text> | --url <thread url>...) --run <dir> [--limit <n>] [--subreddit <name>]\n');
    process.exitCode = 2;
    return;
  }
  const request = { sources: args.source.split(','), query: args.query ?? '', limit: Number(args.limit ?? DEFAULT_LIMIT), runDir: args.run, subreddit: args.subreddit, urls: args.urls };
  const { lines, failed } = await searchMany(request, {});
  for (const line of lines) process.stdout.write(`${line}\n`);
  if (failed) process.exitCode = 1;
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file:').href) await main(process.argv.slice(2));
