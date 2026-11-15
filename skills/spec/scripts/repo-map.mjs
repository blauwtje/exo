import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { orWhenAbsent } from '#absent-path';
import { parseLine } from '#basics';
import { git } from '#git';
import { memoryDirectory } from '#memory-store';
import { SCRIPT_EXTENSIONS } from '#script-extensions';
import { isMain } from '#script-flags';

export const DEFAULT_CAP = 0;

const ROOT = '.';

const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/g;

function folderOf(trackedPath) {
  const lastSlash = trackedPath.lastIndexOf('/');
  return lastSlash < 0 ? ROOT : trackedPath.slice(0, lastSlash);
}

function groupByFolder(files) {
  const folders = new Map([[ROOT, { files: [], subfolders: [], total: 0 }]]);
  const folderAt = (folderPath) => {
    if (!folders.has(folderPath)) {
      folders.set(folderPath, { files: [], subfolders: [], total: 0 });
      folderAt(folderOf(folderPath)).subfolders.push(folderPath);
    }
    return folders.get(folderPath);
  };
  for (const file of files) {
    folderAt(folderOf(file.path)).files.push(file);
    let folderPath = folderOf(file.path);
    while (folderPath !== ROOT) {
      folders.get(folderPath).total += 1;
      folderPath = folderOf(folderPath);
    }
    folders.get(ROOT).total += 1;
  }
  return folders;
}

function label(folderPath) {
  return folderPath === ROOT ? './' : `${folderPath}/`;
}

function countedLine(what, count) {
  return `${what} (${count} file${count === 1 ? '' : 's'})`;
}

function fileLine(file) {
  const name = file.path.slice(file.path.lastIndexOf('/') + 1);
  return file.names.length === 0 ? `  ${name}` : `  ${name}: ${file.names.join(', ')}`;
}

function namedBlock(folderPath, folder) {
  if (folder.files.length === 0) return [];
  return [label(folderPath), ...folder.files.map(fileLine)];
}

function closedLine(folders, folderPath) {
  return countedLine(label(folderPath), folders.get(folderPath).total);
}

function ownFilesLine(folderPath, folder) {
  return countedLine(`${label(folderPath)}*`, folder.files.length);
}

function bytesOf(lines) {
  let bytes = 0;
  for (const line of lines) bytes += Buffer.byteLength(line) + 1;
  return bytes;
}

function bytesAdded(folders, folderPath, ownLines) {
  const folder = folders.get(folderPath);
  const subfolderLines = folder.subfolders.map((subfolder) => closedLine(folders, subfolder));
  return bytesOf(ownLines) + bytesOf(subfolderLines) - bytesOf([closedLine(folders, folderPath)]);
}

function bestValueFirst(folders, level) {
  const ranked = level.map((folderPath) => {
    const folder = folders.get(folderPath);
    const bytes = bytesAdded(folders, folderPath, namedBlock(folderPath, folder));
    const filesPerByte = bytes <= 0 ? Infinity : folder.files.length / bytes;
    return { folderPath, bytes, filesPerByte };
  });
  ranked.sort((left, right) => {
    if (left.filesPerByte !== right.filesPerByte) return right.filesPerByte - left.filesPerByte;
    return left.bytes - right.bytes;
  });
  return ranked.map((entry) => entry.folderPath);
}

function headerLines(heading, tracked, named) {
  return [
    '# Repository map',
    `commit: ${heading.commit}`,
    `cap: ${heading.cap}`,
    `files: ${tracked} tracked, ${named} named, ${tracked - named} behind collapsed lines`,
    ''
  ];
}

function layOut(folders, { opened, filesCounted }, heading) {
  const lines = [];
  const namedPaths = [];
  const visit = (folderPath) => {
    const folder = folders.get(folderPath);
    if (!opened.has(folderPath)) {
      lines.push(closedLine(folders, folderPath));
      return;
    }
    if (filesCounted.has(folderPath)) {
      lines.push(ownFilesLine(folderPath, folder));
    } else {
      for (const line of namedBlock(folderPath, folder)) lines.push(line);
      for (const file of folder.files) namedPaths.push(file.path);
    }
    for (const subfolder of folder.subfolders) visit(subfolder);
  };
  visit(ROOT);
  const header = headerLines(heading, folders.get(ROOT).total, namedPaths.length);
  const printable = lines.map((line) => line.replace(CONTROL_CHARACTERS, '?'));
  return { text: `${[...header, ...printable].join('\n')}\n`, namedPaths };
}

export function renderMap({ commit, cap, files }) {
  const folders = groupByFolder(files);
  const tracked = folders.get(ROOT).total;
  const opened = new Set();
  const filesCounted = new Set();
  let bodyBytes = bytesOf([closedLine(folders, ROOT)]);
  let named = 0;
  const fits = (bytes, filesNamed) => {
    if (cap <= 0) return true;
    const header = headerLines({ commit, cap }, tracked, named + filesNamed);
    return bytesOf(header) + bodyBytes + bytes <= cap;
  };
  const opens = (folderPath) => {
    const folder = folders.get(folderPath);
    const namedBytes = bytesAdded(folders, folderPath, namedBlock(folderPath, folder));
    if (fits(namedBytes, folder.files.length)) {
      bodyBytes += namedBytes;
      named += folder.files.length;
      opened.add(folderPath);
      return true;
    }
    if (folder.files.length === 0 || folder.subfolders.length === 0) return false;
    const countedBytes = bytesAdded(folders, folderPath, [ownFilesLine(folderPath, folder)]);
    if (!fits(countedBytes, 0)) return false;
    bodyBytes += countedBytes;
    filesCounted.add(folderPath);
    opened.add(folderPath);
    return true;
  };
  let level = [ROOT];
  while (level.length > 0) {
    level = bestValueFirst(folders, level).filter(opens).flatMap((folderPath) => folders.get(folderPath).subfolders);
  }
  return layOut(folders, { opened, filesCounted }, { commit, cap });
}

const MANIFEST_NAME = 'package.json';
const MANIFEST_FIELDS = ['scripts', 'bin', 'main', 'exports'];

const MAX_SCANNED_BYTES = 1024 * 1024;

const COMMIT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const DECLARED_NAME = /^export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:const\s+enum|function|class|const|let|var|interface|type|enum|namespace)\b\s*\*?\s*([A-Za-z_$][\w$]*)/gm;
const NAME_LIST = /^export\s+(?:type\s+)?\{([^}]*)\}/gm;
const NAMESPACE_NAME = /^export\s+\*\s+as\s+([A-Za-z_$][\w$]*)/gm;
const COMMONJS_NAME = /^(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/gm;
const ANONYMOUS_DEFAULT = /^export\s+default\b(?!\s+(?:abstract\s+)?(?:async\s+)?(?:function|class)\b\s*\*?\s*[A-Za-z_$])/m;

function listedNames(list) {
  return list
    .split(',')
    .map((entry) => entry.trim().split(/\s+/).at(-1))
    .filter((exportedAs) => IDENTIFIER.test(exportedAs));
}

function exportedNames(source) {
  const names = new Set();
  for (const match of source.matchAll(DECLARED_NAME)) names.add(match[1]);
  for (const match of source.matchAll(NAMESPACE_NAME)) names.add(match[1]);
  for (const match of source.matchAll(COMMONJS_NAME)) names.add(match[1]);
  for (const match of source.matchAll(NAME_LIST)) {
    for (const exportedAs of listedNames(match[1])) names.add(exportedAs);
  }
  if (ANONYMOUS_DEFAULT.test(source)) names.add('default');
  return [...names];
}

function manifestEntries(source) {
  const manifest = parseLine(source);
  if (manifest === null || typeof manifest !== 'object') return [];
  const entries = [];
  for (const field of MANIFEST_FIELDS) {
    const value = manifest[field];
    if (typeof value === 'string') entries.push(`${field} ${value}`);
    if (value !== null && typeof value === 'object') entries.push(`${field} ${Object.keys(value).join(' ')}`);
  }
  return entries.length === 0 ? [] : [entries.join('; ')];
}

function readScannable(file) {
  const stats = fs.lstatSync(file);
  if (!stats.isFile() || stats.size > MAX_SCANNED_BYTES) return null;
  return fs.readFileSync(file, 'utf8');
}

function declaredNames(top, trackedPath) {
  const isManifest = path.basename(trackedPath) === MANIFEST_NAME;
  if (!isManifest && !SCRIPT_EXTENSIONS.has(path.extname(trackedPath))) return [];
  const file = path.join(top, trackedPath);
  const source = orWhenAbsent(() => readScannable(file), null);
  if (source === null) return [];
  return isManifest ? manifestEntries(source) : exportedNames(source);
}

function locateRepository(directory) {
  const top = git(directory, ['rev-parse', '--show-toplevel']);
  if (top.status !== 0) return null;
  const head = git(directory, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  return { top: top.stdout.trim(), commit: head.status === 0 ? head.stdout.trim() : null };
}

function readTrackedFiles(top) {
  const listing = git(top, ['ls-files', '-z']);
  if (listing.status !== 0) {
    const reason = listing.error ? listing.error.message : listing.stderr.trim();
    throw new Error(`git ls-files failed in ${top}: ${reason}`);
  }
  const listedPaths = listing.stdout.split('\0').filter((listedPath) => listedPath !== '');
  const trackedPaths = [...new Set(listedPaths)];
  return trackedPaths.map((trackedPath) => ({ path: trackedPath, names: declaredNames(top, trackedPath) }));
}

function unchangedSince(top, commit) {
  if (!COMMIT_ID.test(commit)) return false;
  const difference = git(top, ['diff', '--quiet', commit, 'HEAD', '--']);
  return difference.status === 0;
}

const USAGE = 'usage: repo-map.mjs [--cap <bytes>]';
const MAP_NAME = 'map.md';

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

if (isMain(import.meta.url)) {
  if (process.argv.includes('--help')) {
    console.log(USAGE);
    process.exit(0);
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
    console.log(`grep -n '<term>' ${file}   # search the map, never read it whole`);
  }
}
