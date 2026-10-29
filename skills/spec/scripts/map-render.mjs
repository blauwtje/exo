import { Buffer } from 'node:buffer';

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
    const nextLevel = [];
    for (const folderPath of bestValueFirst(folders, level)) {
      if (!opens(folderPath)) continue;
      for (const subfolder of folders.get(folderPath).subfolders) nextLevel.push(subfolder);
    }
    level = nextLevel;
  }
  return layOut(folders, opened, filesCounted, { commit, cap });
}
