import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isTestPath } from './red-green.mjs';

const BOUND_LITERAL = /(?<![=!<>])[=:]\s*(\d{3,}(?![\w.])|'[^'\n]{4,}'|"[^"\n]{4,}")/g;
const EXPORT_DECLARATION = /^\s*export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([\w$]+)/;
const EXPORT_LIST = /^\s*export\s*\{([^}]*)\}\s*(?:;|$)/;

function nonTestFiles(files) {
  return files.filter((file) => !isTestPath(file.path));
}

function boundLiterals(file) {
  return file.lines.flatMap((text, index) => {
    if (!file.added.has(index + 1)) return [];
    return [...text.matchAll(BOUND_LITERAL)].map((match) => ({ value: match[1], path: file.path, line: index + 1 }));
  });
}

function duplicateLiterals(files) {
  const byValue = new Map();
  for (const found of nonTestFiles(files).flatMap(boundLiterals)) byValue.set(found.value, [...(byValue.get(found.value) ?? []), found]);
  return [...byValue.values()].filter((group) => group.length > 1).flatMap(([first, ...rest]) => rest.map((found) => (
    { path: found.path, line: found.line, rule: 'duplicate-literal', text: `${found.value} is bound again, first at ${first.path}:${first.line}, so define it once` }
  )));
}

function listedNames(list) {
  return list.split(',').map((item) => item.trim().split(/\s+as\s+/).at(-1)).filter((name) => name && name !== 'default');
}

function exportedNames(file) {
  return file.lines.flatMap((text, index) => {
    if (!file.added.has(index + 1)) return [];
    const declared = EXPORT_DECLARATION.exec(text)?.[1];
    if (declared) return [{ name: declared, line: index + 1 }];
    const list = EXPORT_LIST.exec(text)?.[1];
    return list === undefined ? [] : listedNames(list).map((name) => ({ name, line: index + 1 }));
  });
}

function entryLeaves(value) {
  if (typeof value === 'string') return [value];
  if (value === null || typeof value !== 'object') return [];
  return Object.values(value).flatMap(entryLeaves);
}

function entryFiles(root) {
  const manifest = path.join(root, 'package.json');
  if (!fs.existsSync(manifest)) return new Set();
  const { main, module, bin, exports } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  return new Set([main, module, bin, exports].flatMap(entryLeaves).map((entry) => path.normalize(entry)));
}

function namedElsewhere(root, name, file) {
  try {
    execFileSync('git', ['-C', root, 'grep', '--untracked', '-l', '-w', '-F', '-e', name, '--', '.', `:!${file}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function unusedExports(files, root) {
  const entries = entryFiles(root);
  return nonTestFiles(files).filter((file) => !entries.has(path.normalize(file.path))).flatMap((file) => (
    exportedNames(file).filter(({ name }) => !namedElsewhere(root, name, file.path))
      .map(({ name, line }) => ({ path: file.path, line, rule: 'unused-export', text: `export ${name} is named in no other file, so remove it or use it` }))
  ));
}

export function branchConcerns(files, root) {
  return [...duplicateLiterals(files), ...unusedExports(files, root)]
    .map((entry) => `${entry.path}:${entry.line}; concern; ${entry.rule}; ${entry.text}; report`);
}
