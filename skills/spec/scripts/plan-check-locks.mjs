import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isCovered } from '#plan-landed';

const LOCKS_AND_REGISTRIES = [
  'verify/budgets.mjs',
  'verify/model-kinds.mjs',
  'lib/model-kinds.json',
  'verify/checks/reference-tables.mjs',
  'verify/instruction-density-allowlist.txt',
  'CONTRIBUTING.md'
];
const REPO_PATH_ORIGIN = /import\.meta\.(?:url|dirname)/;

export function mentions(text, needle) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(text);
}

export function filesUnder(root) {
  const listing = spawnSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: Infinity });
  if (listing.status === 0) return listing.stdout.split('\0').filter((name) => name !== '');
  const walk = (directory) => fs.readdirSync(path.join(root, directory), { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .flatMap((entry) => (entry.isDirectory() ? walk(path.posix.join(directory, entry.name)) : [path.posix.join(directory, entry.name)]));
  return walk('');
}

function namesEntry(text, entryPath, otherBasenames) {
  if (mentions(text, entryPath)) return true;
  const base = path.posix.basename(entryPath);
  return !otherBasenames.has(base) && mentions(text, base);
}

export function testTextsOf(testPath) {
  const texts = [fs.readFileSync(testPath, 'utf8')];
  for (const match of texts[0].matchAll(/from\s+'(\.[^']+\.mjs)'/g)) {
    const helper = path.resolve(path.dirname(testPath), match[1]);
    if (fs.existsSync(helper)) texts.push(fs.readFileSync(helper, 'utf8'));
  }
  return texts;
}

// why: a constant bound to import.meta.url or import.meta.dirname, in the test or a helper it imports, points at the repository; any other path is a temp-folder copy.
function repoPathNames(testPath) {
  let names = new Set();
  const texts = testTextsOf(testPath);
  const bindings = texts.flatMap((text) => [...text.matchAll(/(?:const|let)\s+(\w+)\s*=\s*([^;\n]*)/g)].map((match) => [match[1], match[2]]));
  for (;;) {
    const next = new Set(bindings.filter(([, value]) => pointsAtRepository(value, names)).map(([name]) => name));
    if (next.size === names.size) return names;
    names = next;
  }
}

function pointsAtRepository(text, names) {
  return REPO_PATH_ORIGIN.test(text) || [...names].some((name) => new RegExp(`\\b${name}\\b`).test(text));
}

function readsRepositoryFile(lines, entry, names) {
  return lines.some((line) => /\breadFile(?:Sync)?\b/.test(line) && namesEntry(line, entry.path, entry.others) && pointsAtRepository(line, names));
}

export function lockProblems(task, root, sources, later) {
  const listed = [...task.files.map((file) => file.path), ...later];
  return LOCKS_AND_REGISTRIES.filter((lock) => !isCovered(listed, lock) && fs.existsSync(path.join(root, lock))).flatMap((lock) => {
    const text = fs.readFileSync(path.join(root, lock), 'utf8');
    return sources
      .filter((source) => (lock === 'CONTRIBUTING.md' ? mentions(text, source.path) : namesEntry(text, source.path, source.others)))
      .map((source) => `Task ${task.number}: \`${lock}\` names Files: \`${source.path}\` and Files: does not list \`${lock}\``);
  }).concat(lockConstantProblems(task, root, listed));
}

function lockConstantProblems(task, root, listed) {
  const text = `${task.title}\n${task.section}`;
  return LOCKS_AND_REGISTRIES.filter((lock) => !isCovered(listed, lock) && fs.existsSync(path.join(root, lock))).flatMap((lock) => {
    const names = [...fs.readFileSync(path.join(root, lock), 'utf8').matchAll(/export const ([A-Z][A-Z0-9_]*_(?:LOCK|BUDGET|ALLOWLIST))\b/g)].map((match) => match[1]);
    return names.filter((name) => mentions(text, name)).map((name) => `Task ${task.number}: names \`${name}\` from \`${lock}\` and Files: does not list \`${lock}\``);
  });
}

export function readerProblems(task, root, sources) {
  const testFiles = fs.readdirSync(path.join(root, 'tests'));
  const listed = task.files.map((file) => file.path);
  const readable = sources.filter((source) => !LOCKS_AND_REGISTRIES.includes(source.path));
  return testFiles.filter((name) => name.endsWith('.test.mjs') && !isCovered(listed, `tests/${name}`)).flatMap((name) => {
    const testPath = path.join(root, 'tests', name);
    const lines = fs.readFileSync(testPath, 'utf8').split('\n');
    const names = repoPathNames(testPath);
    return readable
      .filter((source) => readsRepositoryFile(lines, source, names))
      .map((source) => `Task ${task.number}: \`tests/${name}\` reads Files: \`${source.path}\` and Files: does not list \`tests/${name}\``);
  });
}
