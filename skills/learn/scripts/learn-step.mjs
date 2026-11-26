import fs from 'node:fs';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isMain, parseFlags, UsageError, USAGE_EXIT } from '#script-flags';

const USAGE = 'usage: node learn-step.mjs --pick <"1 3"|all|none> --candidates <file> [--cwd <dir>]\nmaps the picked numbers of a saved `corrections.mjs candidates --texts` output to ids, runs keep for them and reject for the other shown ids, and prints `kept: <ids>` and `rejected: <ids>`.';
const FLAGS = { pick: 'string', candidates: 'string', cwd: 'string', help: 'boolean' };
const CORRECTIONS = fileURLToPath(new URL('./corrections.mjs', import.meta.url));

function shownIds(file) {
  return fs.readFileSync(file, 'utf8').split('\n').map((line) => line.match(/^(\S+) (?:failed: )?"/)?.[1]).filter(Boolean);
}

function pickedIndexes(pick, count) {
  if (pick === 'all') return [...Array(count).keys()];
  if (pick === 'none') return [];
  const numbers = pick.trim().split(/\s+/).map(Number);
  const bad = numbers.find((number) => !Number.isInteger(number) || number < 1 || number > count);
  if (bad !== undefined) throw new UsageError(`--pick '${pick}' must be numbers from 1 to ${count}, all or none`);
  return numbers.map((number) => number - 1);
}

function decide(command, ids, cwd) {
  if (ids.length === 0) return;
  const result = spawnSync(process.execPath, [CORRECTIONS, command, ...ids, ...(cwd === undefined ? [] : ['--cwd', cwd])], { encoding: 'utf8' });
  if (result.status !== 0) throw new UsageError(result.stderr.trim() || `${command} failed`);
}

function main() {
  const { pick, candidates, cwd } = parseFlags(process.argv.slice(2), FLAGS, { usage: USAGE });
  if (pick === undefined || candidates === undefined) throw new UsageError('--pick and --candidates are required');
  const ids = shownIds(candidates);
  const picked = new Set(pickedIndexes(pick, ids.length));
  const kept = ids.filter((_, index) => picked.has(index));
  const rejected = ids.filter((_, index) => !picked.has(index));
  decide('keep', kept, cwd);
  decide('reject', rejected, cwd);
  process.stdout.write(`kept:${kept.map((id) => ` ${id}`).join('')}\nrejected:${rejected.map((id) => ` ${id}`).join('')}\n`);
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
