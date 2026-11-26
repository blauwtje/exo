import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { facts, handoffTarget } from './handoff.mjs';
import { isMain, parseFlags, UsageError, USAGE_EXIT } from '#script-flags';

const USAGE = 'usage: node handoff-write.mjs --body <file> [--cwd <dir>]\nwrites the handoff file from the body file, replacing its <facts> line with the Written line and the path lists, and prints Saved to <path>.';
const MARKER = /^<facts>$/m;

function main() {
  const { body, cwd = process.cwd() } = parseFlags(process.argv.slice(2), { body: 'string', cwd: 'string' }, { usage: USAGE });
  if (body === undefined) throw new UsageError('--body <file> is required');
  const text = fs.readFileSync(body, 'utf8');
  if (!MARKER.test(text)) throw new UsageError(`${body} has no <facts> line`);
  const { file, branch } = handoffTarget(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text.replace(MARKER, () => facts(cwd, branch).join('\n')));
  console.log(`Saved to ${file}`);
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
