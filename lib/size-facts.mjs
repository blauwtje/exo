// The size facts a skill's activation gate judges by hand: how many files
// changed, how many lines changed, and whether a dependency was added.
// `pick-reviewer.mjs --effort` counted these itself; this module holds the
// one count so every caller reads the same numbers. Imported as
// `#size-facts`, because a skill script never reaches into another skill's
// folder. Run directly it measures the working tree against HEAD, or against
// `--base <ref>` when a caller already has a base to diff, and prints:
// `changed files <n>`, `changed lines <n>`, `dependency-added yes|no`, then
// `small` when the change is at most two files, under 80 changed lines and
// added no dependency, else `large`.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseFlags, UsageError } from '#script-flags';

const SMALL_FILE_LIMIT = 2;
const SMALL_LINE_LIMIT = 80;

// Files that state a project's direct dependencies, across ecosystems this
// repository's skills reason about; a lockfile is not in this list, because
// `poetry.lock`, `package-lock.json` and their siblings resolve dependencies
// a manifest already named rather than adding a new one on their own.
export const MANIFESTS = [
  'package.json', 'requirements.txt', 'pyproject.toml', 'Pipfile',
  'Cargo.toml', 'go.mod', 'Gemfile', 'composer.json',
  'pom.xml', 'build.gradle', 'build.gradle.kts'
];

// A manifest not listed here has no light parser: any change to it counts as
// adding a dependency, the conservative read `route-skills` and
// `build-change` mean when they say "adding a dependency".
const DEPENDENCY_READERS = {
  'package.json': readPackageJsonDependencies,
  'requirements.txt': readRequirementsDependencies,
  'go.mod': readGoModDependencies,
  'Cargo.toml': readCargoTomlDependencies
};

function readPackageJsonDependencies(content) {
  const manifest = JSON.parse(content);
  const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
  return new Set(sections.flatMap((section) => Object.keys(manifest[section] ?? {})));
}

function readRequirementsDependencies(content) {
  const names = content.split('\n')
    .map((line) => line.split('#')[0].trim())
    .filter((line) => line !== '' && !line.startsWith('-'))
    .map((line) => line.split(/[<>=!~;\[ ]/)[0].trim().toLowerCase())
    .filter((name) => name !== '');
  return new Set(names);
}

function readGoModDependencies(content) {
  const names = new Set();
  const requireBlock = content.match(/require\s*\(([\s\S]*?)\)/);
  for (const line of (requireBlock ? requireBlock[1] : '').split('\n')) {
    const match = line.trim().match(/^(\S+)\s+v\S+/);
    if (match) names.add(match[1]);
  }
  for (const match of content.matchAll(/^require\s+(\S+)\s+v\S+/gm)) {
    names.add(match[1]);
  }
  return names;
}

function readCargoTomlDependencies(content) {
  const names = new Set();
  let inDependencies = false;
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('[')) {
      inDependencies = /^\[(dependencies|dev-dependencies|build-dependencies)\]/.test(line);
      continue;
    }
    if (!inDependencies || line === '' || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z0-9_-]+)\s*=/);
    if (match) names.add(match[1]);
  }
  return names;
}

/** Sums a `git diff --numstat` listing; a binary line's `-` counts as no changed lines. */
export function parseNumstat(output) {
  let files = 0;
  let changedLines = 0;
  for (const line of output.split('\n')) {
    if (line === '') continue;
    const [added, deleted] = line.split('\t');
    files += 1;
    changedLines += (added === '-' ? 0 : Number(added)) + (deleted === '-' ? 0 : Number(deleted));
  }
  return { files, changedLines };
}

function pathsFromNumstat(output) {
  return output.split('\n').filter((line) => line !== '').map((line) => line.split('\t')[2]);
}

function countLines(content) {
  if (content === '') return 0;
  const lines = content.split('\n');
  return lines.at(-1) === '' ? lines.length - 1 : lines.length;
}

function readAtRef(ref, relativePath) {
  try {
    return execFileSync('git', ['show', `${ref}:${relativePath}`], { encoding: 'utf8' });
  } catch {
    return null;
  }
}

function readWorkingTreeFile(relativePath) {
  try {
    return readFileSync(relativePath, 'utf8');
  } catch {
    return null;
  }
}

/** True when `relativePath`'s change adds a dependency name absent from its prior content. */
function manifestAddsDependency(relativePath, oldContent, newContent) {
  const name = basename(relativePath);
  if (!MANIFESTS.includes(name)) return false;
  if (newContent === null) return false; // a deleted manifest adds nothing
  const reader = DEPENDENCY_READERS[name];
  if (!reader) return true; // no light parser for this manifest: any touch counts
  try {
    const oldNames = oldContent === null ? new Set() : reader(oldContent);
    const newNames = reader(newContent);
    return [...newNames].some((dependencyName) => !oldNames.has(dependencyName));
  } catch {
    return true; // unparsable content: the conservative read is an addition
  }
}

/**
 * Relative paths touched against the working tree (tracked changes plus
 * untracked new files), or against `base...HEAD` when `base` is given. A
 * caller that needs its own reading of which files changed -- not this
 * module's dependency-added meaning -- takes the paths from here instead of
 * running its own git plumbing.
 */
export function changedPaths({ base } = {}) {
  if (base === undefined) {
    const numstatOutput = execFileSync('git', ['diff', '--numstat', 'HEAD'], { encoding: 'utf8' });
    const untrackedOutput = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' });
    const untrackedPaths = untrackedOutput.split('\0').filter((relativePath) => relativePath !== '');
    return [...pathsFromNumstat(numstatOutput), ...untrackedPaths];
  }
  const numstatOutput = execFileSync('git', ['diff', '--numstat', `${base}...HEAD`], { encoding: 'utf8' });
  return pathsFromNumstat(numstatOutput);
}

function measureAgainstWorkingTree() {
  const numstatOutput = execFileSync('git', ['diff', '--numstat', 'HEAD'], { encoding: 'utf8' });
  const tracked = parseNumstat(numstatOutput);
  const trackedPaths = pathsFromNumstat(numstatOutput);

  const untrackedOutput = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' });
  const untrackedPaths = untrackedOutput.split('\0').filter((relativePath) => relativePath !== '');
  const untrackedLines = untrackedPaths.reduce((total, relativePath) => total + countLines(readFileSync(relativePath, 'utf8')), 0);

  const dependencyAdded = [...trackedPaths, ...untrackedPaths].some((relativePath) => {
    const isUntracked = untrackedPaths.includes(relativePath);
    const oldContent = isUntracked ? null : readAtRef('HEAD', relativePath);
    const newContent = readWorkingTreeFile(relativePath);
    return manifestAddsDependency(relativePath, oldContent, newContent);
  });

  return {
    files: tracked.files + untrackedPaths.length,
    changedLines: tracked.changedLines + untrackedLines,
    dependencyAdded
  };
}

function measureAgainstBase(base) {
  const numstatOutput = execFileSync('git', ['diff', '--numstat', `${base}...HEAD`], { encoding: 'utf8' });
  const { files, changedLines } = parseNumstat(numstatOutput);
  const changedPaths = pathsFromNumstat(numstatOutput);

  const dependencyAdded = changedPaths.some((relativePath) => {
    const oldContent = readAtRef(base, relativePath);
    const newContent = readAtRef('HEAD', relativePath);
    return manifestAddsDependency(relativePath, oldContent, newContent);
  });

  return { files, changedLines, dependencyAdded };
}

/**
 * Counts changed files, changed lines and a dependency addition: against the
 * working tree and HEAD by default (tracked changes plus untracked new
 * files, matching what an uncommitted fix actually touches), or against
 * `base...HEAD` when `base` names a revision a caller already diffs from.
 */
export function measureSizeFacts({ base } = {}) {
  return base === undefined ? measureAgainstWorkingTree() : measureAgainstBase(base);
}

/** Small is at most two files, under 80 changed lines, and no added dependency. */
export function isSmall({ files, changedLines, dependencyAdded }) {
  return files <= SMALL_FILE_LIMIT && changedLines < SMALL_LINE_LIMIT && !dependencyAdded;
}

function main(argv) {
  const flags = parseFlags(argv, { base: 'value' });
  const facts = measureSizeFacts({ base: flags.base });
  process.stdout.write(`changed files ${facts.files}\n`);
  process.stdout.write(`changed lines ${facts.changedLines}\n`);
  process.stdout.write(`dependency-added ${facts.dependencyAdded ? 'yes' : 'no'}\n`);
  process.stdout.write(`${isSmall(facts) ? 'small' : 'large'}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`size-facts: ${error.message}\n`);
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
