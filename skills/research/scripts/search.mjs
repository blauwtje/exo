import process from 'node:process';
import { excludeScratchIfGit, recordSource } from './ledger.mjs';
import { BlockedRoute } from './sources/http.mjs';
import { SOURCES } from './sources/index.mjs';

const DEFAULT_LIMIT = 5;

export async function searchSource(request, context) {
  const { source, query, limit = DEFAULT_LIMIT, runDir } = request;
  const adapter = SOURCES[source];
  if (!adapter) throw new Error(`unknown source ${source}; use ${Object.keys(SOURCES).join(', ')}`);
  const hits = await adapter({ query, limit }, context);
  return hits.map((hit) => {
    const { title, date, signals, description } = hit;
    return recordSource(runDir, { url: hit.url, fields: { source, title, date, signals, description } });
  });
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    values[argv[index].replace(/^--/, '')] = argv[index + 1];
  }
  return values;
}

async function main(argv) {
  excludeScratchIfGit(process.cwd());
  const args = parseArgs(argv);
  if (!args.source || !args.query || !args.run) {
    process.stderr.write('usage: search.mjs --source <name> --query <text> --run <dir> [--limit <n>]\n');
    process.exitCode = 2;
    return;
  }
  try {
    const request = { source: args.source, query: args.query, limit: Number(args.limit ?? DEFAULT_LIMIT), runDir: args.run };
    for (const row of await searchSource(request, {})) {
      const { ref, title, url, date, signals, description } = row;
      process.stdout.write(`${JSON.stringify({ ref, title, url, date, signals, description })}\n`);
    }
  } catch (error) {
    if (!(error instanceof BlockedRoute)) throw error;
    process.stdout.write(`status: blocked ${args.source} ${error.message}\n`);
  }
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file:').href) await main(process.argv.slice(2));
