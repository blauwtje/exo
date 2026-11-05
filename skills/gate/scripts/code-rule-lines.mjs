import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { taskCommits } from '#plan-tasks';
import { codeRuleFindings } from '#code-rules';
import { isTestFirst, isTestPath } from '#red-green';
import { taskPaths } from './pick-reviewer.mjs';
import { isTrailerlessFix, commitsTouching } from './unplanned-paths.mjs';
import { weakenedTests, silencedChecks } from './test-defects.mjs';

function testRepairCommit(task, root, base) {
  const listedTests = task.files.map((file) => file.path).filter(isTestPath);
  return [...commitsTouching(listedTests, root, base).values()].flat().find(isTrailerlessFix);
}

export function claimLines(task, { root, planId, base }) {
  const changed = taskPaths(task, root, planId);
  const lines = [];
  if (isTestFirst(task) && !changed.some(isTestPath)) {
    const repair = testRepairCommit(task, root, base);
    lines.push(repair === undefined
      ? `FAIL claims-diff Task ${task.number} (test-first, but its commit adds or changes no test file)`
      : `WARN claims-diff Task ${task.number} (test-first; its test changed only in repair commit ${repair.sha.slice(0, 7)})`);
  }
  return lines;
}

const DEFECT_KINDS = { removed: 'removed assertion', added: 'added skip', silenced: 'silenced check' };

function defectLine(finding) {
  const [, where, kind, text] = /^(.+?:\d+) (removed|added|silenced) (.*)$/.exec(finding);
  return `${where}; defect; ${DEFECT_KINDS[kind]}; ${text}; report`;
}

function testDefectLines(task, { root, planId }) {
  const show = (...args) => execFileSync('git', ['-C', root, '-c', 'core.quotepath=off', 'show', '--format=', '--no-renames', ...args], { encoding: 'utf8', maxBuffer: Infinity });
  return taskCommits(task, root, planId).flatMap((sha) => {
    const patch = show('-U0', '--no-color', '--no-ext-diff', sha);
    const deleted = show('--name-status', sha).split('\n').flatMap((line) => (line.startsWith('D\t') ? [line.slice(2)] : [])).filter(isTestPath);
    const inDeleted = (finding) => deleted.some((file) => finding.startsWith(`${file}:`));
    return [
      ...deleted.map((file) => `${file}:1; defect; deleted test file; ${file}; report`),
      ...[...weakenedTests(patch), ...silencedChecks(patch)].filter((finding) => !inDeleted(finding)).map(defectLine)
    ];
  });
}

export function codeRulesReport(fails, root, defects = []) {
  const entries = fails.flatMap((finding) => {
    const at = /^(.+?):(\d+) /.exec(finding);
    if (at === null) return [];
    const source = fs.readFileSync(path.join(root, at[1]), 'utf8').split('\n')[Number(at[2]) - 1]?.trim() ?? '';
    if (source === '') return [];
    return [`${finding} defect fix`, `  Probe: ! grep -nF -- '${source.replace(/'/g, "'\\''")}' ${at[1]}`];
  });
  return ['FINDINGS', '', ...entries, ...defects, ''].join('\n');
}

export function codeRuleLines(plan, landed, { root, planId, base }) {
  if (base === undefined) return [];
  const reportPath = path.join(path.resolve(root), '.exo', 'code-rules.md');
  fs.rmSync(reportPath, { force: true });
  const fails = new Set();
  const defects = new Set();
  const lines = [];
  for (const task of plan.tasks.filter((entry) => landed.has(entry.number))) {
    testDefectLines(task, { root, planId }).forEach((line) => defects.add(line));
    const found = codeRuleFindings({ root, base, paths: taskPaths(task, root, planId) });
    found.fails.forEach((finding) => fails.add(finding));
    lines.push(...found.warns.map((warn) => `WARN code-rules Task ${task.number} (${warn})`));
  }
  if (fails.size === 0 && defects.size === 0) return lines;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, codeRulesReport([...fails], root, [...defects]));
  return [...lines, `CODE-RULES ${reportPath}`];
}

export function namesPath(line, file) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w.-])${escaped}(?![\\w-]|\\.\\w)`).test(line);
}
