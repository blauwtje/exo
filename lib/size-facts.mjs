import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseFlags, UsageError, isMain } from '#script-flags';

const SMALL_FILE_LIMIT = 2;
const SMALL_LINE_LIMIT = 80;

export const MANIFESTS = [
  'package.json', 'requirements.txt', 'pyproject.toml', 'Pipfile',
  'Cargo.toml', 'go.mod', 'Gemfile', 'composer.json',
  'pom.xml', 'build.gradle', 'build.gradle.kts'
];

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

const BRACED_RENAME_PATTERN = /^(.*)\{(.*) => (.*)\}(.*)$/;
const PLAIN_RENAME_PATTERN = /^(.*) => (.*)$/;

function normalizeRenamedPath(path) {
  return path.split('/').filter((segment) => segment !== '').join('/');
}

function pathsFromField(field) {
  const braced = field.match(BRACED_RENAME_PATTERN);
  if (braced) {
    const [, prefix, oldPart, newPart, suffix] = braced;
    return [normalizeRenamedPath(`${prefix}${oldPart}${suffix}`), normalizeRenamedPath(`${prefix}${newPart}${suffix}`)];
  }
  const plain = field.match(PLAIN_RENAME_PATTERN);
  if (plain) return [plain[1], plain[2]];
  return [field];
}

function pathsFromNumstat(output) {
  return output.split('\n').filter((line) => line !== '').flatMap((line) => pathsFromField(line.split('\t')[2]));
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

function manifestAddsDependency(relativePath, oldContent, newContent) {
  const name = basename(relativePath);
  if (!MANIFESTS.includes(name)) return false;
  if (newContent === null) return false;
  const reader = DEPENDENCY_READERS[name];
  if (!reader) return true;
  try {
    const oldNames = oldContent === null ? new Set() : reader(oldContent);
    const newNames = reader(newContent);
    return [...newNames].some((dependencyName) => !oldNames.has(dependencyName));
  } catch {
    return true;
  }
}

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

export function measureSizeFacts({ base } = {}) {
  return base === undefined ? measureAgainstWorkingTree() : measureAgainstBase(base);
}

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

if (isMain(import.meta.url)) {
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
