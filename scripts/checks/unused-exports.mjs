import fs from 'node:fs';
import path from 'node:path';
import { listedFiles } from './script-syntax.mjs';

const EXPORT_LINE = /^export\b.*$/;
const EXPORT_FORM = /^export (?:async function|function|const|class) ([\w$]+)/;
const IMPORT_STATEMENT = /^import\s+(?:[\w$]+\s*,\s*)?(?:\{([^}]*)\}|\*\s*as\s+[\w$]+)\s*from\s*['"]([^'"]+)['"]/gm;

const isTest = (file) => file.startsWith('tests/');

function packageImports(repository) {
  const manifest = repository.join('package.json');
  return fs.existsSync(manifest) ? JSON.parse(repository.text(manifest)).imports ?? {} : {};
}

function resolveSpecifier(imports, from, specifier) {
  if (specifier.startsWith('#')) return imports[specifier] === undefined ? null : path.posix.normalize(imports[specifier]);
  if (!specifier.startsWith('.')) return null;
  return path.posix.join(path.posix.dirname(from), specifier);
}

function exportsOf(text) {
  const names = [];
  const unreadable = [];
  text.split('\n').forEach((line, index) => {
    if (!EXPORT_LINE.test(line)) return;
    const form = EXPORT_FORM.exec(line);
    if (form) names.push(form[1]);
    else unreadable.push(index + 1);
  });
  return { names, unreadable };
}

function importsOf(text, imports, from) {
  return [...text.matchAll(IMPORT_STATEMENT)].flatMap(([, list, specifier]) => {
    const target = resolveSpecifier(imports, from, specifier);
    if (target === null) return [];
    const names = list === undefined ? null : list.split(',').map((item) => item.trim().split(/\s+as\s+/)[0]).filter((name) => name !== '');
    return [{ reader: from, target, names }];
  });
}

function isRead(uses, file, name) {
  return uses.some((use) => use.target === file
    && use.reader !== file
    && (isTest(file) || !isTest(use.reader))
    && (use.names === null || use.names.includes(name)));
}

export function checkUnusedExports(report, repository) {
  const files = listedFiles(repository, (entry) => entry.endsWith('.mjs')).map((file) => repository.relative(file));
  const imports = packageImports(repository);
  const texts = new Map(files.map((file) => [file, repository.text(repository.join(file))]));
  const uses = files.flatMap((file) => importsOf(texts.get(file), imports, file));
  const problems = files.flatMap((file) => {
    const { names, unreadable } = exportsOf(texts.get(file));
    const unread = names.filter((name) => !isRead(uses, file, name));
    return [
      ...unreadable.map((line) => `${file}:${line} uses an export form other than export function, export async function, export const and export class`),
      ...(unread.length > 0 ? [`${file} exports ${unread.join(', ')}, which no other file imports`] : [])
    ];
  });
  report.assert(
    problems.length === 0,
    'unused exports',
    { pass: 'every export has a reader', fail: problems.join('; ') }
  );
}
