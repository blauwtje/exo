import fs from 'node:fs';
import path from 'node:path';

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', '.worktrees', '.exo']);
const LITERAL = /(['"`])([^'"`\n]*)\1/g;

const clean = (entry) => entry.split(path.sep).join('/').replace(/^\.\//, '');

function filesUnder(root, folder) {
  const found = [];
  const walk = (relative) => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else found.push(child);
    }
  };
  walk(folder);
  return found;
}

function expand(root, entry) {
  const file = clean(entry);
  if (!file.endsWith('/')) return [file];
  const folder = file.replace(/\/+$/, '');
  if (!folder || !fs.existsSync(path.join(root, folder))) return [folder];
  return [folder, ...filesUnder(root, folder)];
}

function ancestors(file) {
  const parts = file.split('/');
  return parts.map((_, index) => parts.slice(0, index + 1).join('/')).filter(Boolean);
}

function literalsOf(text) {
  return new Set([...text.matchAll(LITERAL)].map((match) => match[2].replace(/\/+$/, '')));
}

function testFiles(root) {
  const directory = path.join(root, 'tests');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter((name) => name.endsWith('.test.mjs')).sort();
}

function readsAny(root, name, wanted) {
  const text = fs.readFileSync(path.join(root, 'tests', name), 'utf8');
  return [...literalsOf(text)].some((literal) => wanted.has(literal));
}

export function coveringTests(root, paths) {
  const wanted = new Set(paths.flatMap((entry) => expand(root, entry)).flatMap(ancestors));
  const covering = testFiles(root).filter((name) => readsAny(root, name, wanted));
  return covering.map((name) => `tests/${name}`);
}
