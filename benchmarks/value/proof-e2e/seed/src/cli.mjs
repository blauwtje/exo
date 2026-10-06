import fs from 'node:fs/promises';
import { parseCsv } from './csv.mjs';
import { renderText } from './render.mjs';
import { summarize } from './summary.mjs';

const SORTS = ['total', 'name'];
const VALUE_OPTIONS = ['--sort', '--top', '--category'];

export const USAGE = `Usage: expenses <file|-> [options]

Options:
  --sort total|name    order of the categories (default: total)
  --top N              show only the first N categories
  --category NAME      only count rows of one category
  -h, --help           show this help
`;

// Value options accept "--name value" and "--name=value".
export function parseArgs(argv) {
  const opts = { file: null, sort: 'total', top: null, category: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      opts.help = true;
    } else if (arg.startsWith('--')) {
      const [name, inline] = arg.split(/=(.*)/s);
      if (!VALUE_OPTIONS.includes(name)) throw new Error(`unknown option ${name}`);
      const value = inline ?? argv[++i];
      if (value === undefined) throw new Error(`${name} needs a value`);
      if (name === '--sort') {
        if (!SORTS.includes(value)) throw new Error(`--sort must be one of ${SORTS.join(', ')}`);
        opts.sort = value;
      } else if (name === '--top') {
        const top = Number(value);
        if (!Number.isInteger(top) || top < 1) throw new Error('--top must be a positive integer');
        opts.top = top;
      } else {
        opts.category = value;
      }
    } else if (opts.file === null) {
      opts.file = arg;
    } else {
      throw new Error(`unexpected argument ${arg}`);
    }
  }
  return opts;
}

async function readAll(stream) {
  let text = '';
  for await (const chunk of stream) text += chunk;
  return text;
}

export async function main(argv, io) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    io.stderr.write(`expenses: ${error.message}\n`);
    return 2;
  }
  if (opts.help || opts.file === null) {
    io.stdout.write(USAGE);
    return opts.help ? 0 : 2;
  }

  let text;
  try {
    text = opts.file === '-' ? await readAll(io.stdin) : await fs.readFile(opts.file, 'utf8');
  } catch (error) {
    io.stderr.write(`expenses: cannot read ${opts.file}: ${error.code ?? error.message}\n`);
    return 1;
  }

  const wanted = opts.category?.toLowerCase();
  const rows = parseCsv(text).filter((row) => wanted === undefined || row.category.trim().toLowerCase() === wanted);
  io.stdout.write(`Expenses from ${opts.file === '-' ? 'stdin' : opts.file} (${rows.length} rows)\n\n`);
  if (rows.length === 0) {
    io.stdout.write('No expenses match.\n');
    return 0;
  }
  io.stdout.write(renderText(summarize(rows, { sort: opts.sort }), { top: opts.top }));
  return 0;
}
