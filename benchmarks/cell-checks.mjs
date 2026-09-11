// benchmarks/cell-checks.mjs
// What a cell leaves in its workdir: added lines on code files (lockfiles
// skipped, tests counted apart, as ponytail counts them) and a correctness
// gate per task kind, so a smaller diff that does not solve the task is not
// a saving.

import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';

const CODE_EXTENSIONS = new Set(['.py', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.go', '.rs', '.java', '.rb', '.sh']);
const LOCKFILES = new Set(['package-lock.json', 'bun.lock', 'uv.lock', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock']);
const ROUTE_MARKER = /^\+\s*@router\.(get|post|put|patch|delete)\(/m;

function git(workdir, args) {
  return execFileSync('git', ['-C', workdir, ...args], { encoding: 'utf8' });
}

function isTestFile(relativePath) {
  const parts = relativePath.split('/');
  const name = parts[parts.length - 1].toLowerCase();
  if (name.startsWith('test_') || name.endsWith('_test.py') || name === 'conftest.py') return true;
  if (/\.(test|spec)\.[jt]sx?$/.test(name)) return true;
  return parts.slice(0, -1).some((part) => ['test', 'tests', '__tests__'].includes(part.toLowerCase()));
}

// Stages everything the agent wrote and counts the diff against HEAD.
export function countLines(workdir) {
  git(workdir, ['add', '-A']);
  const loc = { added: 0, removed: 0, testAdded: 0, files: [] };
  for (const row of git(workdir, ['diff', '--cached', '--numstat', 'HEAD']).trim().split('\n')) {
    if (row === '') continue;
    const [added, removed, file] = row.split('\t');
    if (added === '-' || LOCKFILES.has(path.basename(file)) || !CODE_EXTENSIONS.has(path.extname(file))) continue;
    if (isTestFile(file)) {
      loc.testAdded += Number(added);
      continue;
    }
    loc.added += Number(added);
    loc.removed += Number(removed);
    loc.files.push(file);
  }
  return loc;
}

function changedFiles(workdir) {
  const rows = git(workdir, ['diff', '--cached', '--name-status', 'HEAD']).trim().split('\n');
  return rows.filter((row) => row !== '').map((row) => {
    const [status, file] = row.split('\t');
    return { status: status[0], file };
  });
}

function pythonCompiles(workdir, files) {
  if (files.length === 0) return { ok: true, reason: 'no python changed' };
  const result = spawnSync('python3', ['-m', 'py_compile', ...files], { cwd: workdir, encoding: 'utf8' });
  if (result.error && result.error.code === 'ENOENT') return { ok: true, reason: 'python3 not on PATH: compile unchecked' };
  if (result.status !== 0) return { ok: false, reason: `py_compile failed: ${result.stderr.trim().split('\n').pop()}` };
  return { ok: true, reason: 'py_compile passed' };
}

function backendCorrect(workdir, files) {
  const routes = files.filter(({ file }) => file.startsWith('backend/app/api/routes/') && file.endsWith('.py'));
  const withRoute = routes.some(({ file }) => ROUTE_MARKER.test(git(workdir, ['diff', '--cached', 'HEAD', '--', file])));
  if (!withRoute) return { correct: false, reason: 'no @router.<verb>( line added under backend/app/api/routes/' };
  const python = files.filter(({ status, file }) => status !== 'D' && file.endsWith('.py')).map(({ file }) => file);
  const compiled = pythonCompiles(workdir, python);
  return { correct: compiled.ok, reason: compiled.reason };
}

function frontendCorrect(files) {
  const component = files.find(({ status, file }) => status === 'A' && file.startsWith('frontend/src/') && file.endsWith('.tsx'));
  if (!component) return { correct: false, reason: 'no new .tsx file under frontend/src/' };
  return { correct: true, reason: `new file ${component.file}` };
}

export function measureWorkdir(workdir, task) {
  const loc = countLines(workdir);
  const files = changedFiles(workdir);
  const verdict = task.kind === 'backend' ? backendCorrect(workdir, files) : frontendCorrect(files);
  return { loc, correct: verdict.correct, correctReason: verdict.reason };
}
