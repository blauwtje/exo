import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const EMPTY_BLOB = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391';

export class ScopeError extends Error {}

export function matchScope(files, entries) {
  const rels = files.map((file) => path.posix.normalize(file));
  const specs = entries.map((entry) => `:(glob)${path.posix.normalize(entry).replace(/\/$/, '')}`);
  if (rels.length === 0 || specs.length === 0) return new Set();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-scope-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  const git = (args, input) => {
    const run = spawnSync('git', args, { cwd: dir, env, input, encoding: 'utf8' });
    if (run.status !== 0) throw new ScopeError(`git ${args[0]} failed: ${run.stderr.trim()}`);
    return run.stdout;
  };
  try {
    git(['init', '-q']);
    git(['update-index', '--add', '--index-info'], rels.map((rel) => `100644 ${EMPTY_BLOB}\t${rel}\n`).join(''));
    return new Set(git(['ls-files', '-z', '--', ...specs]).split('\0').filter(Boolean));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function outOfScope(files, cfg) {
  const rels = files.map((file) => path.posix.normalize(file));
  let readOnly;
  let inScope = null;
  try {
    readOnly = matchScope(files, cfg.readOnly ?? []);
    const scope = cfg.scope ?? [];
    if (scope.length > 0) inScope = matchScope(files, scope);
  } catch (error) {
    if (!(error instanceof ScopeError)) throw error;
    return `scope check failed: ${error.message}`;
  }
  const at = rels.findIndex((rel) => readOnly.has(rel) || (inScope && !inScope.has(rel)));
  return at < 0 ? null : `file out of scope: ${files[at]}`;
}
