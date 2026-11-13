import path from 'node:path';
import { SIZE_CAPS } from '../budgets.mjs';

const EVAL_CASE_FILES = ['prompt.md', 'case.yaml'];

function relativePaths(repository) {
  return repository.trackedFiles().map((file) => path.relative(repository.join(), file).split(path.sep).join('/'));
}

function measure(paths) {
  const evalCases = new Set();
  for (const entry of paths) {
    const [folder, name, file, ...rest] = entry.split('/');
    if (folder === 'evals' && name !== 'results' && EVAL_CASE_FILES.includes(file) && rest.length === 0) evalCases.add(name);
  }
  return {
    files: paths.length,
    checkModules: paths.filter((entry) => /^verify\/checks\/[^/]+\.mjs$/.test(entry)).length,
    testFiles: paths.filter((entry) => /^tests\/[^/]+\.test\.mjs$/.test(entry)).length,
    skillScripts: paths.filter((entry) => /^skills\/[^/]+\/scripts\//.test(entry)).length,
    evalCases: evalCases.size
  };
}

export function checkSizeBudgets(report, repository, caps = SIZE_CAPS) {
  const counts = measure(relativePaths(repository));
  for (const [name, cap] of Object.entries(caps)) {
    const detail = `${counts[name]} against the cap of ${cap}`;
    if (counts[name] > cap) {
      report.result('FAIL', `size ${name}`, `${detail}; remove something, never raise the cap in verify/budgets.mjs`);
      continue;
    }
    report.result('PASS', `size ${name}`, detail);
  }
}
