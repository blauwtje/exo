import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { isMain, parseFlags } from '#script-flags';

const REGISTRY_FILE = 'verify/checks/shared-mentions.json';
const MODULE_FILE = 'lib/shared-values.mjs';
const UNIT_DIVISOR = { s: 1000, min: 60 * 1000 };

const readText = (root, file) => fs.readFileSync(path.join(root, file), 'utf8');
const isFrontmatter = (entry) => entry.value.includes('#');

function frontmatterValue(root, reference) {
  const [file, key] = reference.split('#');
  const block = /^---\n([\s\S]*?)\n---/.exec(readText(root, file))?.[1] ?? '';
  const line = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(block);
  if (!line) throw new Error(`${file} has no frontmatter key ${key}`);
  return line[1].trim().replace(/^["']|["']$/g, '');
}

function expectedOf(entry, root, values) {
  if (isFrontmatter(entry)) return frontmatterValue(root, entry.value);
  const found = entry.value.split('.').reduce((member, key) => member?.[key], values);
  if (found === undefined) throw new Error(`${entry.value} is not an export of ${MODULE_FILE}`);
  return String(entry.unit ? found / UNIT_DIVISOR[entry.unit] : found);
}

const loadValues = (root) => import(pathToFileURL(path.join(root, MODULE_FILE)).href);
const registryOf = (root) => JSON.parse(readText(root, REGISTRY_FILE));
const matchesOf = (entry, text) => [...text.matchAll(new RegExp(entry.pattern, 'gmd'))];
const agrees = (entry, capture, expected) => (isFrontmatter(entry) ? capture.toLowerCase() === expected.toLowerCase() : capture === expected);

function entryProblems(entry, root, values) {
  const file = path.join(root, entry.file);
  const matches = fs.existsSync(file) ? matchesOf(entry, fs.readFileSync(file, 'utf8')) : [];
  if (matches.length === 0) return [`${entry.file}: pattern ${entry.pattern} matches nothing`];
  const expected = expectedOf(entry, root, values);
  return matches.filter((match) => !agrees(entry, match[1], expected)).map((match) => `${entry.file}: ${match[1]} is not ${expected} (${entry.value})`);
}

function problemsOf(entry, root, values) {
  try {
    return entryProblems(entry, root, values);
  } catch (error) {
    return [`malformed entry ${JSON.stringify(entry)}: ${error.message}`];
  }
}

export async function checkSharedMentions(report, repository) {
  const values = await loadValues(repository.root);
  const problems = registryOf(repository.root).flatMap((entry) => problemsOf(entry, repository.root, values));
  report.assert(
    problems.length === 0,
    'shared mentions',
    { pass: 'every registered prose mention holds its shared value', fail: problems.join('; ') }
  );
}

export async function writeSharedMentions(root) {
  const values = await loadValues(root);
  const written = [];
  for (const entry of registryOf(root).filter((candidate) => !isFrontmatter(candidate))) {
    const text = readText(root, entry.file);
    const expected = expectedOf(entry, root, values);
    const rewritten = matchesOf(entry, text).reverse().reduce((current, match) => {
      const [start, end] = match.indices[1];
      return current.slice(0, start) + expected + current.slice(end);
    }, text);
    if (rewritten === text) continue;
    fs.writeFileSync(path.join(root, entry.file), rewritten);
    written.push(entry.file);
  }
  return written;
}

if (isMain(import.meta.url)) {
  const flags = parseFlags(process.argv.slice(2), { write: 'boolean', root: 'string' }, { usage: 'Usage: shared-mentions.mjs --write [--root <dir>]' });
  if (!flags.write) throw new Error('pass --write to rewrite the registered mentions');
  const written = await writeSharedMentions(path.resolve(flags.root ?? path.join(import.meta.dirname, '..', '..')));
  process.stdout.write(written.length === 0 ? 'no mention changed\n' : `${written.map((file) => `rewrote ${file}`).join('\n')}\n`);
}
