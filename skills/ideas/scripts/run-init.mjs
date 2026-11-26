import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { isMain, parseFlags, UsageError, USAGE_EXIT } from '#script-flags';

const USAGE = 'usage: node run-init.mjs --question <text> [--home <dir>]\ncreates <home>/.ideas/<YYYY-MM-DD>-<slug>, with -2 or -3 when taken, and prints RUN=<absolute path>.';
const SLUG_LENGTH = 40;
const FALLBACK_SLUG = 'ideas';

const slugOf = (question) => question
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+/, '')
  .slice(0, SLUG_LENGTH)
  .replace(/-+$/, '');

function dateOf(now) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function main() {
  const { question, home = os.homedir() } = parseFlags(process.argv.slice(2), { question: 'string', home: 'string' }, { usage: USAGE });
  if (question === undefined) throw new UsageError('--question <text> is required');
  const slug = slugOf(question) || FALLBACK_SLUG;
  const base = path.join(path.resolve(home), '.ideas', `${dateOf(new Date())}-${slug}`);
  fs.mkdirSync(path.dirname(base), { recursive: true });
  for (let attempt = 1; ; attempt += 1) {
    const folder = attempt === 1 ? base : `${base}-${attempt}`;
    try {
      fs.mkdirSync(folder);
    } catch (error) {
      if (error.code === 'EEXIST') continue;
      throw error;
    }
    console.log(`RUN=${folder}`);
    return;
  }
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(error.message);
    process.exitCode = USAGE_EXIT;
  }
}
