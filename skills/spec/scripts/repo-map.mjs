// Builds the map of the repository the session works in, on demand, and prints
// the path to read. The map sits beside the project memory in the shared git
// directory, so nothing is committed and every linked worktree reads one file.
// Its header records the commit and the cap it was built with: a call that
// finds both unchanged leaves the file alone, and any other call rebuilds it.
// Uncommitted work is not detected.
//
//   node repo-map.mjs [--cap <bytes>]      0 lifts the cap

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { memoryDirectory } from '#memory-store';
import { DEFAULT_CAP, renderMap } from './map-render.mjs';
import { locateRepository, readTrackedFiles, unchangedSince } from './map-source.mjs';

const USAGE = 'usage: repo-map.mjs [--cap <bytes>]';
const MAP_NAME = 'map.md';

// A map with every folder left closed runs to about 200 bytes, so any cap from
// here up can be met.
const MINIMUM_CAP = 500;

function fail(message) {
  console.error(`${message}\n${USAGE}`);
  process.exit(1);
}

function requestedCap(args) {
  let values;
  try {
    ({ values } = parseArgs({ args, options: { cap: { type: 'string' } } }));
  } catch (error) {
    fail(error.message);
  }
  if (values.cap === undefined) return DEFAULT_CAP;
  const cap = /^\d+$/.test(values.cap) ? Number(values.cap) : Number.NaN;
  if (!Number.isSafeInteger(cap) || (cap !== 0 && cap < MINIMUM_CAP)) {
    fail(`--cap takes 0 for no cap, or at least ${MINIMUM_CAP} bytes`);
  }
  return cap;
}

// The commit and the cap a stored map was built with; null when no map is
// stored or its first lines do not read as a header.
function storedHeading(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const [, commitLine = '', capLine = ''] = text.split('\n', 3);
  const commit = /^commit: (\S+)$/.exec(commitLine);
  const cap = /^cap: (\d+)$/.exec(capLine);
  if (commit === null || cap === null) return null;
  return { commit: commit[1], cap: Number(cap[1]) };
}

const cap = requestedCap(process.argv.slice(2));
const repository = locateRepository(process.cwd());
if (repository === null) {
  console.log('no map: this directory is not inside a git repository');
} else if (repository.commit === null) {
  console.log('no map: this repository has no commit yet');
} else {
  const file = path.join(memoryDirectory(repository.top), MAP_NAME);
  const stored = storedHeading(file);
  const current = stored !== null && stored.cap === cap && unchangedSince(repository.top, stored.commit);
  if (!current) {
    const files = readTrackedFiles(repository.top);
    const map = renderMap({ commit: repository.commit, cap, files });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, map.text);
  }
  console.log(file);
}
