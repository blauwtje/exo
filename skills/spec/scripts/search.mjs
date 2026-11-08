import process from 'node:process';
import { excludeScratchIfGit, recordSource } from './ledger.mjs';
import { BlockedRoute } from './sources/http.mjs';
import { SOURCES } from './sources/index.mjs';

const DEFAULT_LIMIT = 5;

export async function searchSource(request, context) {
  const { source, query, limit = DEFAULT_LIMIT, runDir, subreddit, urls } = request;
  const adapter = SOURCES[source];
  if (!adapter) throw new Error(`unknown source ${source}; use ${Object.keys(SOURCES).join(', ')}`);
  const hits = await adapter({ query, limit, subreddit, urls }, context);
  return hits.map((hit) => {
    const { title, date, signals, description } = hit;
    const row = recordSource(runDir, { url: hit.url, fields: { source, title, date, signals, description } });
    return { ...row, comments: hit.comments, blocked: hit.blocked };
  });
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
    process.stderr.write('usage: search.mjs --source <name> (--query <text> | --url <thread url>...) --run <dir> [--limit <n>] [--subreddit <name>]\n');
    process.exitCode = 2;
    return;
  }
  try {
    const request = { source: args.source, query: args.query ?? '', limit: Number(args.limit ?? DEFAULT_LIMIT), runDir: args.run, subreddit: args.subreddit, urls: args.urls };
    for (const row of await searchSource(request, {})) {
      const { ref, title, url, date, signals, description, comments, blocked } = row;
      process.stdout.write(`${JSON.stringify({ ref, title, url, date, signals, description, comments, blocked })}\n`);
    }
  } catch (error) {
    if (!(error instanceof BlockedRoute)) throw error;
    process.stdout.write(`status: blocked ${args.source} ${error.message}\n`);
  }
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file:').href) await main(process.argv.slice(2));
