import fs from 'node:fs';
import path from 'node:path';

const TABLE_ROW = /^\|\s*`(?<path>[^`]+\.md)`\s*\|\s*(?<readWhen>.*?)\s*\|\s*\r?$/gm;

function referenceTableEntries(content) {
  return [...content.matchAll(TABLE_ROW)]
    .map((match) => ({ path: match.groups.path, readWhen: match.groups.readWhen.trim() }));
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

export function chainedReferences(skillFile) {
  const skillDirectory = path.dirname(skillFile);
  const reached = new Set();
  const queue = [skillFile];
  while (queue.length > 0) {
    const current = queue.shift();
    const rows = referenceTableEntries(fs.readFileSync(current, 'utf8'));
    for (const row of rows) {
      const target = path.resolve(skillDirectory, row.path);
      if (!fs.existsSync(target) || !fs.statSync(target).isFile() || reached.has(target)) continue;
      reached.add(target);
      if (target.startsWith(path.join(skillDirectory, 'references') + path.sep)) queue.push(target);
    }
  }
  return reached;
}

export function unreachableReferences(skillFile) {
  const reached = chainedReferences(skillFile);
  return listFiles(path.join(path.dirname(skillFile), 'references'))
    .filter((file) => file.endsWith('.md') && !reached.has(file));
}

export function inReferences(root, file) {
  return file.endsWith('.md') && path.relative(root, file).split(path.sep).includes('references');
}
