import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { codeBlocks } from '#plan-regions';
import { isCovered } from '#plan-landed';
import { fenceAfter } from '#plan-tasks';
import { taskSize } from '#plan-waves';
import { dataLiterals, literalFinder, literalFragments } from '#data-literals';
import { derivedNames } from '#derivation';
import { isEvidenceValue, WORDING_PATH } from '#evidence-rules';
import { wholeSuiteKeys } from '#suite-command';
import { main } from './plan-check.mjs';

const STEP_HEADING = /^Step \d+: .*$/;
const PLACEHOLDER_ELLIPSIS = /(?<![.\w])\.\.\.(?!\w)/;
const MAX_LINES = 250;
const MAX_FILES = 4;

const RISK_CATEGORIES = ['security boundary', 'persisted format', 'public signature', 'dependency'];

function stepsOf(section) {
  const steps = [];
  let current = null;
  let fence = 0;
  for (const line of section.split('\n')) {
    fence = fenceAfter(line, fence);
    if (fence === 0 && STEP_HEADING.test(line)) {
      current = { heading: line, lines: [] };
      steps.push(current);
      continue;
    }
    if (current !== null) current.lines.push(line);
  }
  return steps.map((step) => ({ heading: step.heading, text: step.lines.join('\n') }));
}

export function checkCommit(task) {
  if (task.commitBlock === null) return [`Task ${task.number}: no Commit: block`];
  if (!new RegExp(`"Plan-task: ${task.number}"`).test(task.commitBlock)) {
    return [`Task ${task.number}: Commit: block carries no "Plan-task: ${task.number}" trailer`];
  }
  return [];
}

export function checkGitAdd(task) {
  if (task.commitBlock === null) return [];
  const addLine = task.commitBlock.match(/^git add (.+)$/m);
  if (addLine === null) return [`Task ${task.number}: Commit: block has no 'git add' line`];
  const added = addLine[1].trim().split(/\s+/).sort().join(' ');
  const files = task.files.map((file) => file.path).sort().join(' ');
  if (added !== files) return [`Task ${task.number}: 'git add ${addLine[1]}' does not match Files: (${files})`];
  return [];
}

export function checkSteps(task) {
  const problems = [];
  for (const step of stepsOf(task.section)) {
    if (codeBlocks(step.text).length === 0) continue;
    if (!/^Run: /m.test(step.text)) problems.push(`Task ${task.number}: '${step.heading}' has code but no Run:`);
    if (!/^Expected: /m.test(step.text)) problems.push(`Task ${task.number}: '${step.heading}' has code but no Expected:`);
  }
  return problems;
}

export function checkPlaceholders(task) {
  const problems = [];
  if (/\btodo\b/i.test(task.section)) problems.push(`Task ${task.number}: a TODO placeholder stands in for code`);
  if (PLACEHOLDER_ELLIPSIS.test(task.section)) problems.push(`Task ${task.number}: an '...' placeholder stands in for code`);
  if (/similar to Task/i.test(task.section)) problems.push(`Task ${task.number}: 'similar to Task' points at another task instead of showing the code`);
  return problems;
}

export function checkSize(task) {
  const size = taskSize(task);
  if (size.lines > MAX_LINES || size.files > MAX_FILES) {
    return [`Task ${task.number}: split Task ${task.number} (${size.lines} code lines, ${size.files} files)`];
  }
  return [];
}

function checkWholeSuiteProof(task) {
  if (task.proof === null || wholeSuiteKeys(task.proof).length === 0) return [];
  return [`Task ${task.number}: 'Proof: ${task.proof}' runs the whole suite: name the one test file or script that shows this task alone landed`];
}

const MERGE_BASE_CALL = /\$\(\s*git merge-base[^)]*\)/g;
const BARE_DEFAULT_DIFF = /\bgit\s+(?:diff|log|show|rev-list|diff-tree)\b[^;&|\n]*?(?<![\w/.-])(main|master)(?=\.\.|[\s"')]|$)/;

function checkBareDefaultBranchProof(task) {
  if (task.proof === null) return [];
  const match = task.proof.replace(MERGE_BASE_CALL, '').match(BARE_DEFAULT_DIFF);
  if (match === null) return [];
  return [`Task ${task.number}: 'Proof: ${task.proof}' diffs against bare \`${match[1]}\`, which moves when the default branch moves: use \`$(git merge-base ${match[1]} HEAD)\` as the base`];
}

const BOUNDARY_FORMAT = "'Boundary: in <accepted input> | out <rejected input> | test <test file in Files>'";

function checkBoundary(task) {
  if (task.risk !== 'security boundary') return [];
  if (task.boundary === null) return [`Task ${task.number}: 'Risk: security boundary' has no 'Boundary:' field: add ${BOUNDARY_FORMAT}`];
  const listed = task.files.map((file) => file.path);
  if (isCovered(listed, task.boundary.test)) return [];
  return [`Task ${task.number}: 'Boundary:' test \`${task.boundary.test}\` is not in Files:: use ${BOUNDARY_FORMAT}`];
}

export function checkCompactFields(task) {
  const problems = [];
  if (task.filesField === null) problems.push(`Task ${task.number}: field line lacks 'Files:'`);
  if (task.proof === null) problems.push(`Task ${task.number}: field line lacks 'Proof:'`);
  if (task.risk !== null && !RISK_CATEGORIES.includes(task.risk)) {
    problems.push(`Task ${task.number}: 'Risk: ${task.risk}' is not one of ${RISK_CATEGORIES.join(', ')}`);
  }
  return [...problems, ...checkBoundary(task), ...checkWholeSuiteProof(task), ...checkBareDefaultBranchProof(task)];
}

const WORDING_FOLDER = /^(?:skills\/(?:[^/]+\/(?:references\/)?)?|agents\/|hooks\/|harnesses\/codex\/)$/;

export function checkEvidence(plan) {
  const named = plan.tasks.filter((task) => task.evidence !== null);
  const problems = named
    .filter((task) => !isEvidenceValue(task.evidence.trim()))
    .map((task) => `Task ${task.number}: 'Evidence: ${task.evidence}' is not 'benchmarks/results/<file>', 'benchmarks/pressure/<path>' or 'none (<reason>)'`);
  const wording = plan.tasks.find((task) => task.files.some((file) => WORDING_PATH.test(file.path) || WORDING_FOLDER.test(file.path)));
  if (wording !== undefined && named.length === 0) {
    problems.push(`Task ${wording.number}: Files change skill, agent or session wording and no task has an 'Evidence:' field: add '| Evidence: <benchmarks/results/<file> | benchmarks/pressure/<path> | none (<reason>)>' to one task`);
  }
  return problems;
}

function hasHead(root) {
  return spawnSync('git', ['-C', root, 'rev-parse', '--verify', '-q', 'HEAD'], { stdio: 'ignore' }).status === 0;
}

// why: land searches names relative to the run worktree, so an absolute, outside or ignored path is one it can never find.
function namesUnsearchablePath(fragment, root) {
  const target = path.resolve(root, fragment);
  if (!fs.existsSync(target)) return false;
  const relative = path.relative(root, fs.realpathSync(target));
  if (path.isAbsolute(fragment) || relative.startsWith('..') || path.isAbsolute(relative)) return true;
  return spawnSync('git', ['-C', root, 'check-ignore', '-q', '--', relative], { stdio: 'ignore' }).status === 0;
}

export function checkDataLiterals(task, root, planPath) {
  if (task.literals !== null || !task.data || !hasHead(root)) return [];
  const candidates = [...new Set(dataLiterals(task.data))].filter((literal) => literalFragments(literal).some((fragment) => namesUnsearchablePath(fragment, root)));
  if (candidates.length === 0) return [];
  const found = literalFinder(root, planPath);
  const flagged = candidates.filter((literal) => !found(literal) && literalFragments(literal).some((fragment) => namesUnsearchablePath(fragment, root) && !found(fragment)));
  if (flagged.length === 0) return [];
  return [`Task ${task.number}: Data: names ${flagged.map((literal) => `\`${literal}\``).join(', ')}, a path the land check cannot search (absolute, outside the repository or git-ignored); name it relative to the repository, or add \`Literals: none (<reason>)\``];
}

export function checkDerivedNames(planText, resolvedRoot) {
  if (resolvedRoot === undefined || !fs.existsSync(path.join(resolvedRoot, 'verify/checks/derivation.mjs'))) return [];
  const names = derivedNames();
  return planText.split('\n').flatMap((line, index) => {
    const lowered = line.toLowerCase();
    return names
      .filter((name) => lowered.includes(name))
      .map((name) => `line ${index + 1}: derived name '${name}', which the derivation check refuses in every tracked file: reword it`);
  });
}
