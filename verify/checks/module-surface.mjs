import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const IMPORT_FROM = /\b(?:import|export)\s*(\{[^}]*\}|\*(?:\s+as\s+\w+)?|\w+)\s*(?:,\s*\{[^}]*\})?\s*from\s*['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /(\{[^{}]*\})\s*=\s*await\s+import\(\s*['"]([^'"]+)['"]\s*\)/g;
const DECLARED_EXPORT = /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+(\w+)/gm;
const LISTED_EXPORT = /^export\s*\{([^}]*)\}\s*;?\s*$/gm;
const FUNCTION_START = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)[^\n]*\{\n/gm;
const ARROW_START = /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^\n]*\)\s*=>\s*\{\n/gm;
const SNAPSHOT = /^benchmarks\/replay\/cases\//;
const MIN_BODY_LINES = 3;

function trackedModules(root) {
  const listed = spawnSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '*.mjs'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (listed.status !== 0) return [];
  return listed.stdout.split('\n').filter((name) => name !== '' && fs.existsSync(path.join(root, name)));
}

function namesIn(clause) {
  return clause.replace(/[{}]/g, '').split(',').map((part) => part.trim().split(/\s+as\s+/)[0]).filter(Boolean);
}

function exportedNames(text) {
  const declared = [...text.matchAll(DECLARED_EXPORT)].map((match) => match[1]);
  const listed = [...text.matchAll(LISTED_EXPORT)].flatMap((match) => namesIn(match[1]).map((name) => name.trim()));
  return [...declared, ...listed];
}

function aliasMap(root) {
  const file = path.join(root, 'package.json');
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8')).imports ?? {};
}

function resolveSpecifier(importer, specifier, aliases, modules) {
  if (specifier.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
  if (!specifier.startsWith('#')) return null;
  if (aliases[specifier]) return path.posix.normalize(aliases[specifier]);
  const stem = specifier.slice(1);
  return modules.find((name) => path.posix.basename(name, '.mjs') === stem) ?? null;
}

function buildIndex(root, modules) {
  const aliases = aliasMap(root);
  const imported = new Map();
  const statements = [];
  for (const importer of modules) {
    const text = fs.readFileSync(path.join(root, importer), 'utf8');
    const atLineStart = (match) => match.index === 0 || text[match.index - 1] === '\n';
    const found = [...text.matchAll(IMPORT_FROM)].map((match) => ({ match, checked: atLineStart(match) })).concat([...text.matchAll(DYNAMIC_IMPORT)].map((match) => ({ match, checked: true })));
    for (const { match, checked } of found) {
      const [, clause, specifier] = match;
      const target = resolveSpecifier(importer, specifier, aliases, modules);
      if (!target || target === importer) continue;
      const names = imported.get(target) ?? new Set();
      if (clause.startsWith('*')) names.add('*');
      if (clause.startsWith('{')) namesIn(clause).forEach((name) => names.add(name));
      imported.set(target, names);
      if (checked && !(SNAPSHOT.test(importer) && specifier.startsWith('#'))) statements.push({ importer, clause, target });
    }
  }
  return { imported, statements };
}

function bodiesBetween(text, start, close) {
  const bodies = new Map();
  for (const match of text.matchAll(start)) {
    const rest = text.slice(match.index + match[0].length);
    const end = rest.indexOf(close);
    if (end === -1) continue;
    const lines = rest.slice(0, end).split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length >= MIN_BODY_LINES) bodies.set(match[1], lines.join('\n'));
  }
  return bodies;
}

function functionBodies(text) {
  return new Map([...bodiesBetween(text, FUNCTION_START, '\n}\n'), ...bodiesBetween(text, ARROW_START, '\n};\n')]);
}

function unusedExportProblems(root, index, files) {
  return files.flatMap((file) => {
    const imported = index.imported.get(file) ?? new Set();
    if (imported.has('*')) return [];
    const names = exportedNames(fs.readFileSync(path.join(root, file), 'utf8'));
    return names.filter((name) => name !== 'main' && !imported.has(name)).map((name) => `${file} exports ${name} that no tracked file imports: drop the export`);
  });
}

function duplicateBodyProblems(root, files) {
  const seen = new Map();
  const entries = files.flatMap((file) => [...functionBodies(fs.readFileSync(path.join(root, file), 'utf8'))].map(([name, body]) => ({ file, name, body })));
  const duplicateOf = ({ file, name, body }) => {
    const first = seen.get(body);
    if (!first) seen.set(body, { file, name });
    return first;
  };
  return entries.flatMap((entry) => {
    const first = duplicateOf(entry);
    if (!first) return [];
    return [`${entry.file} defines ${entry.name} with the same body as ${first.name} in ${first.file}: define it once and import it`];
  });
}

function missingImportProblems(root, index) {
  return index.statements.flatMap(({ importer, clause, target }) => missingNames(root, importer, clause, target));
}

function missingNames(root, importer, clause, target) {
  if (!clause.startsWith('{')) return [];
  if (!fs.existsSync(path.join(root, target))) return [];
  const text = fs.readFileSync(path.join(root, target), 'utf8');
  if (/^export\s*\*/m.test(text)) return [];
  const exported = new Set(exportedNames(text));
  return namesIn(clause.replace(/:[^,}]*/g, '')).filter((name) => !exported.has(name)).map((name) => `${importer} imports ${name} from ${target}, which does not export it`);
}

export function surfaceProblems(root, files) {
  const index = buildIndex(root, trackedModules(root));
  return [...unusedExportProblems(root, index, files), ...duplicateBodyProblems(root, files), ...missingImportProblems(root, index)];
}

const SURFACE_GLOBS = ['lib/*.mjs', 'hooks/*.mjs', 'verify/*.mjs', 'verify/checks/*.mjs', 'harnesses/*.mjs', 'harnesses/*/*.mjs', 'skills/*/scripts/*.mjs'];
const EXPORT_SCOPES = [/^lib\//, /^hooks\//];

function scopedFiles(root) {
  const listed = spawnSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', ...SURFACE_GLOBS], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (listed.status !== 0) return [];
  return listed.stdout.split('\n').filter((name) => name !== '' && fs.existsSync(path.join(root, name)));
}

export function checkModuleSurface(report, repository) {
  const files = scopedFiles(repository.root);
  const exportFiles = files.filter((name) => EXPORT_SCOPES.some((scope) => scope.test(name)));
  const index = buildIndex(repository.root, trackedModules(repository.root));
  const problems = [...unusedExportProblems(repository.root, index, exportFiles), ...duplicateBodyProblems(repository.root, files), ...missingImportProblems(repository.root, index)];
  report.assert(problems.length === 0, 'module surface', `${files.length} modules with no unused export and no repeated function body`, problems.join('; '));
}
