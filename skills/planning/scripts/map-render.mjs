// Lays a repository's tracked files out as the map a session reads: a header,
// then one block per folder holding its files and the names each one declares.
// Under a byte cap a folder that does not fit stays one line carrying its file
// count, so every tracked file is named or counted and none is dropped.

import { Buffer } from 'node:buffer';

export const DEFAULT_CAP = 4000;

const ROOT = '.';

// A path or a manifest value is repository content, and a line break inside one
// would forge a map line, so a control character prints as a question mark.
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/g;

function folderOf(trackedPath) {
  const lastSlash = trackedPath.lastIndexOf('/');
  return lastSlash < 0 ? ROOT : trackedPath.slice(0, lastSlash);
}

// Every folder that holds a tracked file, keyed by its path: its own files, its
// subfolders, and the count of files anywhere beneath it.
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

// Every line of the map ends in one line break, so a line costs its own bytes
// and one more.
function bytesOf(lines) {
  let bytes = 0;
  for (const line of lines) bytes += Buffer.byteLength(line) + 1;
  return bytes;
}

// The bytes the map grows by when a folder's counted line gives way to
// `ownLines` and one counted line per subfolder. A folder whose open block is
// shorter than its counted line gives a negative figure.
function bytesAdded(folders, folderPath, ownLines) {
  const folder = folders.get(folderPath);
  const subfolderLines = folder.subfolders.map((subfolder) => closedLine(folders, subfolder));
  return bytesOf(ownLines) + bytesOf(subfolderLines) - bytesOf([closedLine(folders, folderPath)]);
}

// Folders of one depth open by the files they name per byte they add, highest
// first, so thirty files in 200 bytes open before one file in 100. A folder
// that adds no bytes opens before any that does, and of two folders worth the
// same the smaller opens first.
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

function layOut(folders, opened, filesCounted, heading) {
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
  // One byte for one byte, so the size renderMap kept count of still holds.
  const printable = lines.map((line) => line.replace(CONTROL_CHARACTERS, '?'));
  return { text: `${[...header, ...printable].join('\n')}\n`, namedPaths };
}

// `files` is the tracked list in git's own order, each entry `{ path, names }`,
// and a cap of 0 lifts the cap. Folders open breadth-first, so the shape of the
// whole repository lands before the detail of any one corner of it. A folder
// whose own files do not fit still opens onto its subfolders, with those files
// counted on one `folder/*` line; one without subfolders has nothing to open
// onto and stays closed. The size of the map is kept as a running count, the
// body's bytes plus a header whose length follows the number of files named,
// so trying a folder costs that folder's lines and never a render of the map.
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
    const nextLevel = [];
    for (const folderPath of bestValueFirst(folders, level)) {
      if (!opens(folderPath)) continue;
      for (const subfolder of folders.get(folderPath).subfolders) nextLevel.push(subfolder);
    }
    level = nextLevel;
  }
  return layOut(folders, opened, filesCounted, { commit, cap });
}
