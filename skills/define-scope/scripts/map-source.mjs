// What the repository map is made from: the repository a directory sits in, its
// tracked paths, the names a JavaScript or TypeScript file exports and the entry
// points a package.json declares. Names are matched by pattern at the start of a
// line, with no parser: an export inside a template literal is matched too,
// while `export const { a } = b` and `module.exports = { a }` are not. A parser
// would lift that limit, and this script takes no dependency.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx']);

const MANIFEST_NAME = 'package.json';
const MANIFEST_FIELDS = ['scripts', 'bin', 'main', 'exports'];

// A bundle or a generated file past this size declares nothing a reader looks
// for, and reading it would dominate the run.
const MAX_SCANNED_BYTES = 1024 * 1024;

// The listing of a large monorepo runs to several megabytes, and the default
// buffer of one would fail it.
const GIT_OUTPUT_BYTES = 256 * 1024 * 1024;

const COMMIT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const DECLARED_NAME = /^export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:const\s+enum|function|class|const|let|var|interface|type|enum|namespace)\b\s*\*?\s*([A-Za-z_$][\w$]*)/gm;
const NAME_LIST = /^export\s+(?:type\s+)?\{([^}]*)\}/gm;
const NAMESPACE_NAME = /^export\s+\*\s+as\s+([A-Za-z_$][\w$]*)/gm;
const COMMONJS_NAME = /^(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/gm;
const ANONYMOUS_DEFAULT = /^export\s+default\b(?!\s+(?:abstract\s+)?(?:async\s+)?(?:function|class)\b\s*\*?\s*[A-Za-z_$])/m;

function git(directory, ...args) {
  return spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8', maxBuffer: GIT_OUTPUT_BYTES });
}

export function exportedNames(source) {
  const names = new Set();
  for (const match of source.matchAll(DECLARED_NAME)) names.add(match[1]);
  for (const match of source.matchAll(NAMESPACE_NAME)) names.add(match[1]);
  for (const match of source.matchAll(COMMONJS_NAME)) names.add(match[1]);
  for (const match of source.matchAll(NAME_LIST)) {
    for (const entry of match[1].split(',')) {
      // `local as exported` and `type Name` both end on the exported name.
      const words = entry.trim().split(/\s+/);
      const exportedAs = words.at(-1);
      if (IDENTIFIER.test(exportedAs)) names.add(exportedAs);
    }
  }
  if (ANONYMOUS_DEFAULT.test(source)) names.add('default');
  return [...names];
}

// One entry such as `scripts build test; main ./index.mjs`: a field holding a
// string gives that string, a field holding an object gives its keys.
function manifestEntries(source) {
  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch {
    return [];
  }
  if (manifest === null || typeof manifest !== 'object') return [];
  const entries = [];
  for (const field of MANIFEST_FIELDS) {
    const value = manifest[field];
    if (typeof value === 'string') entries.push(`${field} ${value}`);
    if (value !== null && typeof value === 'object') entries.push(`${field} ${Object.keys(value).join(' ')}`);
  }
  return entries.length === 0 ? [] : [entries.join('; ')];
}

// A symbolic link is never followed: a tracked link may point outside the
// repository, and the map holds names from inside it only. A path the working
// tree no longer holds, or one that cannot be read, keeps its place in the map
// and loses only its names.
function declaredNames(top, trackedPath) {
  const isManifest = path.basename(trackedPath) === MANIFEST_NAME;
  if (!isManifest && !SCRIPT_EXTENSIONS.has(path.extname(trackedPath))) return [];
  const file = path.join(top, trackedPath);
  let source;
  try {
    const stats = fs.lstatSync(file);
    if (!stats.isFile() || stats.size > MAX_SCANNED_BYTES) return [];
    source = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  return isManifest ? manifestEntries(source) : exportedNames(source);
}

// Null outside a repository. `top` is the root of the work tree, and `commit`
// is null while the repository has no commit yet.
export function locateRepository(directory) {
  const top = git(directory, 'rev-parse', '--show-toplevel');
  if (top.status !== 0) return null;
  const head = git(directory, 'rev-parse', '--verify', '--quiet', 'HEAD');
  return { top: top.stdout.trim(), commit: head.status === 0 ? head.stdout.trim() : null };
}

// Every tracked path in git's own order, each with the names it declares.
export function readTrackedFiles(top) {
  const listing = git(top, 'ls-files', '-z');
  if (listing.status !== 0) {
    const reason = listing.error ? listing.error.message : listing.stderr.trim();
    throw new Error(`git ls-files failed in ${top}: ${reason}`);
  }
  // An unmerged path is listed once per stage.
  const listedPaths = listing.stdout.split('\0').filter((listedPath) => listedPath !== '');
  const trackedPaths = [...new Set(listedPaths)];
  return trackedPaths.map((trackedPath) => ({ path: trackedPath, names: declaredNames(top, trackedPath) }));
}

// True while HEAD holds the same tree as `commit`. The id comes out of a file
// anyone can edit, so anything that is not a full object id is refused before
// git sees it, where a value opening with a dash would be read as an option. A
// commit the repository no longer knows counts as changed.
export function unchangedSince(top, commit) {
  if (!COMMIT_ID.test(commit)) return false;
  const difference = git(top, 'diff', '--quiet', commit, 'HEAD', '--');
  return difference.status === 0;
}
