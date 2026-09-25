// Prints the top paths by commit count over the last six months, so `audit-architecture`
// can scope an audit from churn without reading the tree itself.
//
// `git log --format=` alone drops the blank line between commits' name-only
// blocks (git prints no separator when the header format is empty), which
// would merge every commit into one block and undercount repeats. `%x00`
// gives an unambiguous per-commit delimiter instead: no path can contain it.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseFlags, UsageError } from '#script-flags';

const BLOCK_SEPARATOR = '\0';

export function rankHotspots(logOutput, { top, exists }) {
  const counts = new Map();
  for (const block of logOutput.split(BLOCK_SEPARATOR)) {
    const paths = new Set(
      block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    );
    for (const path of paths) {
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([path]) => exists(path))
    .sort(([pathA, countA], [pathB, countB]) => countB - countA || pathA.localeCompare(pathB))
    .slice(0, top)
    .map(([path, count]) => `${count} ${path}`);
}

function parseTop(value) {
  if (value === undefined) return 10;
  const top = Number(value);
  if (!Number.isInteger(top) || top <= 0) throw new UsageError(`flag '--top' needs a positive integer`);
  return top;
}

function main(argv) {
  const flags = parseFlags(argv, { root: 'value', top: 'value' });
  const root = flags.root ?? process.cwd();
  const top = parseTop(flags.top);
  const logOutput = execFileSync(
    'git',
    ['-C', root, 'log', '--since=6.months', '--no-merges', '--format=%x00', '--name-only'],
    { encoding: 'utf8' }
  );
  const lines = rankHotspots(logOutput, { top, exists: (path) => existsSync(join(root, path)) });
  if (lines.length === 0) {
    process.stdout.write('hotspots: none in 6 months\n');
    return;
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`hotspots: ${error.message}\n`);
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
